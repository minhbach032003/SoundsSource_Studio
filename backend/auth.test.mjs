import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { AuthBackend, verifyGoogleToken, verifySessionToken, loadConfig } from './auth.mjs';

const hash = s => createHash('sha256').update(s).digest('base64url');
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const now = 1800000000000;
const redirect = 'http://127.0.0.1:49152/callback';
const cfg = { clientId: 'desktop-client.apps.googleusercontent.com', clientSecret: 'test-only', publicUrl: 'http://127.0.0.1:8787', jwtSecret: 'test-key-not-a-real-secret-0123456789', sessionSeconds: 3600 };
function googleToken(overrides = {}, header = {}) {
  const claims = { sub: 'google-123', email: 'user@gmail.com', name: 'Test User', email_verified: true,
    iss: 'https://accounts.google.com', aud: cfg.clientId, nonce: 'test-nonce', exp: now / 1000 + 300, iat: now / 1000, ...overrides };
  const data = [ { alg: 'RS256', kid: jwk.kid, ...header }, claims ].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), keys.privateKey).toString('base64url')}`;
}
const verify = token => verifyGoogleToken(token, { clientId: cfg.clientId, nonce: 'test-nonce', keys: [jwk], now });

test('Google ID token requires real RS256 signature and exact security claims', () => {
  assert.equal(verify(googleToken()).provider_user_id, 'google-123');
  for (const claims of [ { aud: 'attacker' }, { iss: 'https://accounts.google.com.attacker.test' },
    { nonce: 'wrong' }, { exp: now / 1000 - 1 }, { email_verified: false }, { email_verified: undefined },
    { sub: '' }, { email: '' }, { iat: now / 1000 + 900 }, { exp: undefined }, { aud: [cfg.clientId, 'other'], azp: 'other' } ]) {
    assert.throws(() => verify(googleToken(claims)), /Google identity rejected/);
  }
  assert.throws(() => verify(googleToken({}, { alg: 'none' })), /Google identity rejected/);
  assert.throws(() => verify(googleToken().slice(0, -20) + 'forged'), /Google identity rejected/);
  assert.throws(() => verify('header.payload.fake'), /Google identity rejected/);
});

function fixture() {
  let time = now; const rows = new Map(); let logins = 0; let exchanges = 0;
  const repo = {
    async login(profile, issue) { logins++; const user = { id: 'usr-1', email: profile.email, name: profile.name, avatar_url: null }; const session = issue(user); rows.set(session.session_id, session); return { user, token: session.token }; },
    async session(claims, digest) { const row = rows.get(claims.session_id); return row?.token_hash === digest ? { id: 'usr-1', email: 'user@gmail.com', name: 'Test User' } : null; },
    async logout(claims) { rows.delete(claims.session_id); },
  };
  let tokenReply;
  const verifier = 'a'.repeat(64);
  const fetcher = async (url, options) => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return new Response(JSON.stringify({ keys: [jwk] }));
    assert.equal(url, 'https://oauth2.googleapis.com/token'); exchanges++;
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('client_id'), cfg.clientId);
    assert.equal(body.get('code_verifier'), verifier, 'Google receives the native verifier, not an unrelated server PKCE');
    assert.equal(body.get('redirect_uri'), redirect, 'token exchange must bind the original loopback callback');
    assert.equal(body.get('code'), 'real-code');
    return new Response(JSON.stringify({ id_token: tokenReply }));
  };
  const auth = new AuthBackend({ config: cfg, repo, fetcher, clock: () => time });
  function start() { return auth.start(hash(verifier), redirect); }
  function reply(started, overrides = {}) {
    const url = new URL(started.authorization_url);
    tokenReply = googleToken({ nonce: url.searchParams.get('nonce'), ...overrides });
    return { state: url.searchParams.get('state'), code: 'real-code' };
  }
  return { auth, start, reply, verifier, advance() { time += 600001; }, get logins() { return logins; }, get exchanges() { return exchanges; } };
}

test('Desktop client authorization uses the native loopback URI and native PKCE challenge', () => {
  const f = fixture(); const s = f.start(); const url = new URL(s.authorization_url);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), redirect, 'Desktop OAuth cannot redirect to a public backend callback');
  assert.equal(url.searchParams.get('code_challenge'), hash(f.verifier));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  for (const bad of [undefined, 'https://evil.test/callback', 'http://localhost:49152/callback',
    'http://127.0.0.1.evil.test:49152/callback', 'http://user@127.0.0.1:49152/callback',
    'http://127.0.0.1:0/callback', 'http://127.0.0.1:65536/callback', 'http://127.0.0.1:49152/other',
    'http://127.0.0.1:49152/callback?x=1', 'http://127.0.0.1:49152/callback#x']) {
    assert.throws(() => f.auth.start(hash(f.verifier), bad), /Invalid loopback redirect/);
  }
});

test('code exchange binds verifier, state, nonce, one-time redemption and revocable persisted session', async () => {
  const f = fixture(); const started = f.start(); const code = f.reply(started);
  await assert.rejects(f.auth.complete(started.login_id, 'b'.repeat(64), code), /Login expired or invalid/);
  await assert.rejects(f.auth.complete(started.login_id, f.verifier, { ...code, state: 'wrong' }), /Login expired or invalid/);
  assert.equal(f.exchanges, 0);
  const result = await f.auth.complete(started.login_id, f.verifier, code);
  assert.equal(result.user.id, 'usr-1'); assert.equal(f.logins, 1); assert.equal(f.exchanges, 1);
  assert.equal(verifySessionToken(result.token, cfg, now).sub, 'usr-1');
  assert.throws(() => verifySessionToken(result.token, cfg, now + 3600001), /Session invalid/);
  assert.equal((await f.auth.session(result.token)).id, 'usr-1');
  await assert.rejects(f.auth.session(result.token + 'x'), /Session invalid/);
  await assert.rejects(f.auth.complete(started.login_id, f.verifier, code), /Login expired or invalid/);
  await f.auth.logout(result.token);
  await assert.rejects(f.auth.session(result.token), /Session invalid/);
});

test('expired, missing-code, forged Google response and cancelled flows cannot authenticate', async () => {
  let f = fixture(); let s = f.start(); let code = f.reply(s); f.advance();
  await assert.rejects(f.auth.complete(s.login_id, f.verifier, code), /Login expired or invalid/);
  f = fixture(); s = f.start(); code = f.reply(s);
  await assert.rejects(f.auth.complete(s.login_id, f.verifier, { state: code.state }), /Invalid authorization code/);
  assert.equal(f.exchanges, 0);
  await assert.rejects(f.auth.complete(s.login_id, f.verifier, f.reply(s, { email_verified: false })), /Google identity rejected/);
  await assert.rejects(f.auth.complete(s.login_id, f.verifier, code), /Login expired or invalid/);
  s = f.start(); code = f.reply(s); await f.auth.cancel(s.login_id, f.verifier);
  await assert.rejects(f.auth.complete(s.login_id, f.verifier, code), /Login expired or invalid/);
  assert.equal(f.logins, 0);
});

test('concurrent redemption exchanges and persists exactly once; database failure fails closed', async () => {
  const f = fixture(); const s = f.start(); const code = f.reply(s);
  const results = await Promise.allSettled([f.auth.complete(s.login_id, f.verifier, code), f.auth.complete(s.login_id, f.verifier, code)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.logins, 1); assert.equal(f.exchanges, 1);
  const g = fixture(); const pending = g.start(); const reply = g.reply(pending);
  g.auth.repo.login = async () => { throw new Error('postgres://secret:password@internal'); };
  await assert.rejects(g.auth.complete(pending.login_id, g.verifier, reply), /Authentication service unavailable/);
});

test('login state validates challenges and enforces capacity bounds', () => {
  const f = fixture();
  for (const bad of [null, '', 'a'.repeat(42), 'a'.repeat(44), 'é'.repeat(43)]) {
    assert.throws(() => f.auth.start(bad, redirect), /Invalid login request/);
  }
  for (let i = 0; i < 1000; i++) f.start();
  assert.throws(() => f.start(), /Please retry login later/);
  f.advance(); assert.ok(f.start().login_id);
});

test('invalid server configuration fails closed without revealing secrets', () => {
  assert.throws(() => loadConfig({}), /Authentication backend is not configured/);
  const env = { GOOGLE_CLIENT_ID: cfg.clientId, GOOGLE_CLIENT_SECRET: cfg.clientSecret,
    RUST_SOUND_JWT_SECRET: cfg.jwtSecret, RUST_SOUND_NEON_URL: 'postgresql://user:private@db.example/db', AUTH_PUBLIC_URL: cfg.publicUrl };
  assert.equal(loadConfig(env).publicUrl, cfg.publicUrl);
  for (const url of ['http://attacker.test', 'https://good.test@evil.test/', 'https://good.test/base?x=1']) {
    assert.throws(() => loadConfig({ ...env, AUTH_PUBLIC_URL: url }), /Authentication backend is not configured/);
  }
  assert.throws(() => loadConfig({ ...env, RUST_SOUND_JWT_SECRET: 'short' }), /Authentication backend is not configured/);
});
