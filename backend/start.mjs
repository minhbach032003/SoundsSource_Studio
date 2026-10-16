import pg from 'pg';
import { AuthBackend, loadConfig } from './auth.mjs';
import { AuthRepository } from './repository.mjs';
import { createAuthServer } from './server.mjs';

try {
  const config = loadConfig(process.env);
  // Strip SSL query options so pg cannot silently replace verified TLS settings.
  const url = new URL(config.databaseUrl);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const pool = new pg.Pool({ connectionString: url.href, ssl: { rejectUnauthorized: true },
    max: 5, connectionTimeoutMillis: 10000, statement_timeout: 10000, idle_in_transaction_session_timeout: 15000 });
  pool.on('error', () => console.error('Authentication database connection interrupted'));
  await pool.query('SELECT 1'); // Read-only readiness check, never auto-migrate.
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
  const server = createAuthServer(new AuthBackend({ config, repo: new AuthRepository(pool) }));
  server.on('error', () => { console.error('Authentication server failed to listen'); process.exitCode = 1; pool.end(); });
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log('Authentication backend listening'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => pool.end()));
} catch {
  console.error('Authentication backend could not start. Check server-only configuration and database connectivity.');
  process.exitCode = 1;
}
