import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthServer } from './server.mjs';

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
  } finally { await new Promise(resolve => server.close(resolve)); }
});
