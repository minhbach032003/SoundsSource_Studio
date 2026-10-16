import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync('src/lib/googleAuth.svelte.ts', 'utf8').replace(/^import .*\n/gm, '');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
async function setup(native = true) {
  const removed = []; const calls = []; const handlers = {};
  const context = { exports: {}, $state: v => v, window: {}, isTauri: () => native,
    localStorage: { getItem: () => '{"name":"Forged","email":"fake@test.com"}', removeItem: k => removed.push(k), setItem: () => assert.fail('Credentials/profile must not be persisted in localStorage') },
    invoke: async (name, args) => { calls.push({ name, args }); return handlers[name]?.(args) ?? null; }, console };
  vm.runInNewContext(js, context); await new Promise(resolve => setImmediate(resolve));
  return { state: context.exports.googleAuthState, calls, handlers, removed };
}
const user = { id: 'usr-1', name: 'Verified', email: 'user@gmail.com', avatar_url: 'https://example.com/a.png' };
{
  const f = await setup(); assert.equal(f.state.user, null, 'legacy storage must not authenticate');
  assert.ok(f.removed.includes('ss_auth_token')); assert.ok(f.removed.includes('ss_google_user'));
  assert.ok(f.calls.some(c => c.name === 'auth_session'));
  f.handlers.auth_google_login = () => user;
  await f.state.signInWithGoogle(); assert.equal(f.state.user.email, user.email);
  assert.equal(f.state.token, undefined, 'JS must never receive/store bearer token');
  assert.equal(f.calls.some(c => c.name.includes('custom') || c.name.includes('pkce')), false);
  f.handlers.auth_logout = () => { throw new Error('offline'); };
  await assert.rejects(f.state.signOut()); assert.equal(f.state.user.email, user.email, 'failed revocation must retain account');
  f.handlers.auth_logout = () => null; await f.state.signOut(); assert.equal(f.state.user, null);
}
{
  const f = await setup(false);
  await assert.rejects(f.state.signInWithGoogle()); assert.equal(f.state.user, null, 'browser preview cannot fabricate identity');
  assert.equal(f.state.isLoading, false);
}
{
  const f = await setup(); let finish;
  f.handlers.auth_google_login = () => new Promise(resolve => finish = resolve);
  const pending = f.state.signInWithGoogle();
  assert.equal(f.state.isLoading, true);
  await f.state.cancelLogin(); finish(user); await pending;
  assert.equal(f.state.user, null, 'cancelled pending result must not authenticate');
  assert.equal(f.state.isLoading, false);
  assert.ok(f.calls.some(c => c.name === 'auth_google_cancel'));
  assert.ok(f.calls.some(c => c.name === 'auth_google_discard_cancelled'), 'late success must discard native credentials even if remote revocation is offline');
}
console.log('Google auth state: legacy storage, native session, logout failure, preview and cancellation checks passed');
