import { createServer } from 'node:http';
import { AuthError, safeErrorCode } from './auth.mjs';

export function createAuthServer(auth, log = entry => console.info(JSON.stringify(entry))) {
  const rates = new Map();
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    let operation;
    const outcome = (entry) => { if (operation) { try { log({ operation, ...entry }); } catch {} } };
    const json = (code, body) => {
      outcome({ outcome: code < 400 ? 'succeeded' : 'failed', status: code, ...(safeErrorCode(body.code) ? { code: body.code } : {}) });
      res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
    };
    try {
      if (!req.url || req.url.length > 8192) throw new AuthError('Invalid request', 400);
      const path = new URL(req.url, auth.config.publicUrl);
      if (req.method === 'POST') {
        if (path.pathname === '/auth/google/start') operation = 'google_start';
        if (path.pathname === '/auth/google/complete') operation = 'google_complete';
      }
      outcome({ outcome: 'received' });
      if (req.headers.origin && req.headers.origin !== auth.config.publicUrl) throw new AuthError('Request not allowed', 403);
      const now = Date.now();
      for (const [key, rate] of rates) if (rate.until <= now) rates.delete(key);
      const key = `${req.socket.remoteAddress}:${path.pathname === '/auth/google/start' ? 'start' : 'other'}`;
      if (!rates.has(key)) {
        if (rates.size >= 10000) throw new AuthError('Please retry later', 429);
        rates.set(key, { until: now + 60000, count: 0 });
      }
      const rate = rates.get(key);
      if (++rate.count > (path.pathname === '/auth/google/start' ? 20 : 240)) throw new AuthError('Please retry later', 429);
      if (req.method === 'GET' && path.pathname === '/health') return json(200, { status: 'ready' });
      const bearer = () => {
        const v = req.headers.authorization;
        if (typeof v !== 'string' || !v.startsWith('Bearer ') || v.length > 8200) throw new AuthError('Session invalid', 401);
        return v.slice(7);
      };
      if (req.method === 'GET' && path.pathname === '/auth/session') return json(200, { user: await auth.session(bearer()) });
      if (req.method === 'GET' && path.pathname === '/auth/pet/progress') return json(200, await auth.getPetProgress(bearer()));
      if (req.method !== 'POST') throw new AuthError('Not found', 404);
      if (path.pathname === '/auth/logout') { await auth.logout(bearer()); return json(200, { ok: true }); }
      if (path.pathname === '/auth/pet/progress') {
        if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new AuthError('JSON request required', 415);
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new AuthError('Request too large', 413); chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AuthError('Invalid request', 400); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AuthError('Invalid request', 400);
        return json(200, await auth.savePetProgress(bearer(), body));
      }
      if (!['/auth/google/start', '/auth/google/complete', '/auth/google/cancel'].includes(path.pathname)) throw new AuthError('Not found', 404);
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new AuthError('JSON request required', 415);
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new AuthError('Request too large', 413); chunks.push(chunk); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AuthError('Invalid request', 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AuthError('Invalid request', 400);
      if (path.pathname === '/auth/google/start') return json(200, auth.start(body.challenge, body.redirect_uri));
      if (path.pathname === '/auth/google/cancel') { await auth.cancel(body.login_id, body.verifier); return json(200, { ok: true }); }
      json(200, await auth.complete(body.login_id, body.verifier, { code: body.code, state: body.state }));
    } catch (error) {
      const code = error instanceof AuthError ? safeErrorCode(error.code) : undefined;
      json(error instanceof AuthError ? error.status : 503, {
        error: error instanceof AuthError ? error.message : 'Authentication service unavailable',
        ...(code ? { code } : {}),
      });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.timeout = 45000;
  return server;
}
