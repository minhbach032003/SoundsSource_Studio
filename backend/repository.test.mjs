import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AuthRepository } from './repository.mjs';
import { digest } from './auth.mjs';

const profile = { provider_user_id: 'sub-123', email: 'verified@example.com', name: 'Verified', avatar_url: null };
function fakeDb({ identity, email, broken = false } = {}) {
  const queries = []; let released = false;
  const db = { async query(sql, values) {
    queries.push({ sql, values });
    if (sql.includes('JOIN users')) return { rows: identity ? [identity] : [] };
    if (sql.includes('lower(email)')) return { rows: email ? [email] : [] };
    if (sql.includes('RETURNING')) return { rows: [{ id: identity?.id || email?.id || values[0], email: profile.email, name: profile.name, avatar_url: null }] };
    if (broken && sql.startsWith('INSERT INTO auth_sessions')) throw new Error('DB write failure');
    return { rows: [] };
  }, release() { released = true; } };
  return { pool: { connect: async () => db }, queries, get released() { return released; } };
}
const issue = user => ({ session_id: 'session-1', token_hash: 'only-digest', token: 'private-bearer', expires_at: new Date(Date.now() + 60000), sub: user.id });
for (const [label, input] of [['new account', {}], ['existing email', { email: { id: 'existing-email' } }], ['existing subject', { identity: { id: 'existing-subject' } }]]) {
  test(`transactional repository: ${label}, parameterized writes, no raw token persisted`, async () => {
    const db = fakeDb(input); const repo = new AuthRepository(db.pool);
    const result = await repo.login(profile, issue);
    if (input.email || input.identity) assert.equal(result.user.id, input.email?.id || input.identity?.id);
    assert.equal(db.queries[0].sql, 'BEGIN'); assert.equal(db.queries.at(-1).sql, 'COMMIT');
    const insert = db.queries.find(q => q.sql.startsWith('INSERT INTO auth_sessions'));
    assert.equal(insert.values[2], 'only-digest');
    assert.equal(JSON.stringify(db.queries).includes('private-bearer'), false);
    assert.ok(db.queries.every(q => !q.sql.includes(profile.email)));
    if (input.identity) assert.equal(db.queries.some(q => q.sql.includes('lower(email)')), false, 'subject cannot be reassigned by changed email');
    assert.equal(db.released, true);
  });
}
test('database failure rolls back identity and session transaction', async () => {
  const db = fakeDb({ broken: true }); await assert.rejects(new AuthRepository(db.pool).login(profile, issue));
  assert.equal(db.queries.at(-1).sql, 'ROLLBACK'); assert.equal(db.released, true);
});

test('disposable PostgreSQL: repeat login, persisted restore and isolated revocation', {
  skip: !process.env.AUTH_TEST_DATABASE_URL || process.env.AUTH_TEST_DATABASE_CONFIRM !== 'disposable',
}, async () => {
  const url = new URL(process.env.AUTH_TEST_DATABASE_URL);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const options = { connectionString: url.href, ssl: { rejectUnauthorized: true }, max: 3, connectionTimeoutMillis: 10000, statement_timeout: 10000 };
  let pool = new pg.Pool(options); let userId;
  const p = { ...profile, provider_user_id: `test-${randomUUID()}`, email: `rust-sound-test-${randomUUID()}@example.invalid` };
  const sessions = [];
  function create(user) { const id = randomUUID(); const token = randomUUID(); const s = { sub: user.id, session_id: id, token, token_hash: digest(token), expires_at: new Date(Date.now() + 60000) }; sessions.push(s); return s; }
  try {
    const repo = new AuthRepository(pool);
    const first = await repo.login(p, create); userId = first.user.id;
    const again = await repo.login(p, create); assert.equal(again.user.id, userId);
    await pool.end(); pool = new pg.Pool(options); // Different connection pool simulates backend restart.
    const restored = new AuthRepository(pool);
    assert.equal((await restored.session(sessions[0], sessions[0].token_hash)).id, userId);
    await restored.logout(sessions[0], sessions[0].token_hash);
    assert.equal(await restored.session(sessions[0], sessions[0].token_hash), null);
    assert.equal((await restored.session(sessions[1], sessions[1].token_hash)).id, userId);
  } finally { if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId]); await pool.end(); }
});
