import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthServer } from './server.mjs';
import { AuthError } from './auth.mjs';

test('login outcome diagnostics contain only fixed operation, status and allowlisted code', async () => {
  const logs = [];
  const auth = { config: { publicUrl: 'http://127.0.0.1:8787' },
    start() { return { login_id: 'private-login-id', authorization_url: 'private-url' }; },
    async complete() { throw new AuthError('Google login failed', 502, 'GOOGLE_TOKEN_EXCHANGE_FAILED'); } };
  const server = createAuthServer(auth, entry => logs.push(entry));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = path => fetch(`${base}${path}?code=private-query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({code:'private-code',verifier:'private-verifier'}) });
  try {
    assert.equal((await post('/auth/google/start')).status, 200);
    const r = await post('/auth/google/complete');
    assert.equal(r.status, 502);
    assert.deepEqual(await r.json(), { error: 'Google login failed', code: 'GOOGLE_TOKEN_EXCHANGE_FAILED' });
    assert.deepEqual(logs, [
      { operation: 'google_start', outcome: 'received' },
      { operation: 'google_start', outcome: 'succeeded', status: 200 },
      { operation: 'google_complete', outcome: 'received' },
      { operation: 'google_complete', outcome: 'failed', status: 502, code: 'GOOGLE_TOKEN_EXCHANGE_FAILED' },
    ]);
    auth.complete = async () => { throw new Error('postgres://private-password'); };
    const failed = await post('/auth/google/complete'); assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: 'Authentication service unavailable' });
    auth.complete = async () => { throw new AuthError('Rejected', 400, 'private-arbitrary-code'); };
    const unknown = await post('/auth/google/complete');
    assert.deepEqual(await unknown.json(), { error: 'Rejected' });
    assert.doesNotMatch(JSON.stringify(logs), /private|postgres|code=|verifier/);
    assert.deepEqual(logs.at(-1), { operation: 'google_complete', outcome: 'failed', status: 400 });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('HTTP boundary rejects cross-origin, malformed and oversized requests and sanitizes internal failures', async () => {
  const auth = { config: { publicUrl: 'http://127.0.0.1:8787' },
    start() { throw new Error('postgres://password@private'); },
    async session() { throw new Error('private JWT signing key'); } };
  const server = createAuthServer(auth); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    let r = await fetch(`${url}/auth/google/start`, { method: 'POST', headers: { Origin: 'https://evil.test' } });
    assert.equal(r.status, 403); assert.equal(r.headers.get('access-control-allow-origin'), null);
    r = await fetch(`${url}/auth/google/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(r.status, 400);
    r = await fetch(`${url}/auth/google/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(9000) }) });
    assert.equal(r.status, 413);
    r = await fetch(`${url}/auth/google/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: 'Authentication service unavailable' });
    assert.equal(r.headers.get('cache-control'), 'no-store');
    r = await fetch(`${url}/auth/session`); assert.equal(r.status, 401);

    // Unauthenticated pet progress requests fail closed
    r = await fetch(`${url}/auth/pet/progress`);
    assert.equal(r.status, 401);
    r = await fetch(`${url}/auth/pet/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
