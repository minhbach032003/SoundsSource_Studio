import { createHash, createHmac, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify } from 'node:crypto';

export class AuthError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new AuthError(message, status); };
const random = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const bounded = (v, max = 512) => typeof v === 'string' && v.length > 0 && v.length <= max;
const encode = v => Buffer.from(JSON.stringify(v)).toString('base64url');

export function loadConfig(env) {
  try {
    const url = new URL(env.AUTH_PUBLIC_URL);
    const db = new URL(env.RUST_SOUND_NEON_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1')) ||
      !['postgres:', 'postgresql:'].includes(db.protocol) ||
      !bounded(env.GOOGLE_CLIENT_ID) || !env.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com') ||
      !bounded(env.GOOGLE_CLIENT_SECRET) || !bounded(env.RUST_SOUND_JWT_SECRET, 4096) ||
      Buffer.byteLength(env.RUST_SOUND_JWT_SECRET) < 32) throw new Error();
    return { publicUrl: url.origin, databaseUrl: env.RUST_SOUND_NEON_URL, clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET, jwtSecret: env.RUST_SOUND_JWT_SECRET, sessionSeconds: 7 * 86400 };
  } catch { fail('Authentication backend is not configured', 503); }
}

export function verifyGoogleToken(token, { clientId, nonce, keys, now = Date.now() }) {
  try {
    if (!bounded(token, 16384)) throw new Error();
    const parts = token.split('.'); if (parts.length !== 3) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const c = JSON.parse(Buffer.from(parts[1], 'base64url'));
    const key = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
    if (header.alg !== 'RS256' || header.crit || !key || !verify('RSA-SHA256', Buffer.from(parts.slice(0, 2).join('.')),
      createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error();
    const audience = Array.isArray(c.aud) ? c.aud.includes(clientId) && c.azp === clientId : c.aud === clientId;
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(c.iss) || !audience ||
      (c.azp && c.azp !== clientId) || !Number.isSafeInteger(c.exp) || c.exp <= now / 1000 ||
      !Number.isSafeInteger(c.iat) || c.iat > now / 1000 + 60 || c.iat >= c.exp ||
      !equal(c.nonce, nonce) || c.email_verified !== true || !bounded(c.sub, 255) ||
      !bounded(c.email, 320) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw new Error();
    let avatar;
    try { const u = new URL(c.picture); if (u.protocol === 'https:' && !u.username && !u.password) avatar = u.href; } catch {}
    return { provider_user_id: c.sub, email: c.email.toLowerCase(), name: bounded(c.name, 200) ? c.name : c.email, avatar_url: avatar ?? null };
  } catch { fail('Google identity rejected', 401); }
}

function signSession(user, config, now) {
  const claims = { sub: user.id, session_id: randomUUID(), iss: config.publicUrl, aud: 'rust-sound-desktop',
    iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + config.sessionSeconds };
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  const token = `${body}.${createHmac('sha256', config.jwtSecret).update(body).digest('base64url')}`;
  return { ...claims, token, token_hash: digest(token), expires_at: new Date(claims.exp * 1000) };
}
export function verifySessionToken(token, config, now = Date.now()) {
  try {
    if (!bounded(token, 8192)) throw new Error();
    const parts = token.split('.'); if (parts.length !== 3) throw new Error();
    const signature = createHmac('sha256', config.jwtSecret).update(parts.slice(0, 2).join('.')).digest('base64url');
    if (!equal(parts[2], signature)) throw new Error();
    const h = JSON.parse(Buffer.from(parts[0], 'base64url')); const c = JSON.parse(Buffer.from(parts[1], 'base64url'));
    if (h.alg !== 'HS256' || h.typ !== 'JWT' || c.iss !== config.publicUrl || c.aud !== 'rust-sound-desktop' ||
      !bounded(c.sub, 128) || !bounded(c.session_id, 128) || !Number.isSafeInteger(c.exp) ||
      !Number.isSafeInteger(c.iat) || c.iat > now / 1000 + 60 || c.exp <= now / 1000) throw new Error();
    return c;
  } catch { fail('Session invalid', 401); }
}

export class AuthBackend {
  constructor({ config, repo, fetcher = fetch, clock = Date.now }) {
    Object.assign(this, { config, repo, fetcher, clock });
    // ponytail: single-instance, bounded OAuth state; use shared expiring storage before horizontal scaling.
    this.pending = new Map(); this.jwks = null; this.keysExpire = 0;
  }
  prune() { for (const [id, p] of this.pending) if (p.expires <= this.clock()) this.pending.delete(id); }
  start(challenge, redirectUri) {
    this.prune();
    if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) fail('Invalid login request');
    const port = typeof redirectUri === 'string' && /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/callback$/.exec(redirectUri);
    if (!port || Number(port[1]) > 65535) fail('Invalid loopback redirect');
    if (this.pending.size >= 1000) fail('Please retry login later', 429);
    const id = random(); const p = { state: random(), nonce: random(), challenge, redirectUri,
      expires: this.clock() + 5 * 60000 };
    this.pending.set(id, p);
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: p.redirectUri,
      response_type: 'code', scope: 'openid email profile', state: p.state, nonce: p.nonce,
      code_challenge: p.challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    return { login_id: id, authorization_url: u.href };
  }
  proof(id, verifier) {
    this.prune(); const p = this.pending.get(id);
    if (!p || !bounded(verifier, 128) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !equal(digest(verifier), p.challenge)) fail('Login expired or invalid', 401);
    return p;
  }
  async googleJson(url, options = {}) {
    try {
      const res = await this.fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error();
      const text = await res.text(); if (text.length > 131072) throw new Error();
      return JSON.parse(text);
    } catch { fail('Google login failed', 502); }
  }
  async complete(id, verifier, { code, state } = {}) {
    const p = this.proof(id, verifier);
    if (!equal(p.state, state)) fail('Login expired or invalid', 401);
    if (!bounded(code, 4096)) fail('Invalid authorization code');
    this.pending.delete(id); // Consume before any await: only one Google exchange/session is possible.
    const token = await this.googleJson('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
      code, client_id: this.config.clientId, client_secret: this.config.clientSecret, code_verifier: verifier,
      redirect_uri: p.redirectUri, grant_type: 'authorization_code' }) });
      if (!this.jwks || this.keysExpire <= this.clock()) {
        const data = await this.googleJson('https://www.googleapis.com/oauth2/v3/certs');
        if (!Array.isArray(data.keys) || data.keys.length > 10) fail('Google login failed', 502);
        this.jwks = data.keys; this.keysExpire = this.clock() + 5 * 60000;
      }
      // Google can rotate keys during the cache lifetime; refresh once for an unknown kid.
      let kid; try { kid = JSON.parse(Buffer.from(token.id_token.split('.')[0], 'base64url')).kid; } catch {}
      if (kid && !this.jwks.some(k => k.kid === kid)) {
        const data = await this.googleJson('https://www.googleapis.com/oauth2/v3/certs');
        if (!Array.isArray(data.keys) || data.keys.length > 10) fail('Google login failed', 502);
        this.jwks = data.keys;
      }
    const profile = verifyGoogleToken(token.id_token, { clientId: this.config.clientId, nonce: p.nonce, keys: this.jwks, now: this.clock() });
    if (p.expires <= this.clock()) fail('Login expired or invalid', 401);
    try { return await this.repo.login(profile, user => signSession(user, this.config, this.clock())); }
    catch { fail('Authentication service unavailable', 503); }
  }
  async cancel(id, verifier) { this.proof(id, verifier); this.pending.delete(id); }
  async session(token) {
    const claims = verifySessionToken(token, this.config, this.clock());
    let user; try { user = await this.repo.session(claims, digest(token)); } catch { fail('Authentication service unavailable', 503); }
    if (!user) fail('Session invalid', 401);
    return user;
  }
  async logout(token) {
    const claims = verifySessionToken(token, this.config, this.clock());
    try { await this.repo.logout(claims, digest(token)); } catch { fail('Authentication service unavailable', 503); }
  }
  async getPetProgress(token) {
    const claims = verifySessionToken(token, this.config, this.clock());
    const valid = await this.session(token);
    if (!valid) fail('Session invalid', 401);
    try { return await this.repo.getPetProgress(claims.sub); } catch { fail('Authentication service unavailable', 503); }
  }
  async savePetProgress(token, doc) {
    const claims = verifySessionToken(token, this.config, this.clock());
    const valid = await this.session(token);
    if (!valid) fail('Session invalid', 401);
    try { return await this.repo.savePetProgress(claims.sub, doc); } catch { fail('Authentication service unavailable', 503); }
  }
}
