# Google authentication backend

Requires Node 22+, a **Google Web application** OAuth client and operator-managed PostgreSQL/Neon. The desktop never connects to Neon. Do not ship server env files in desktop resources.

## Server configuration

Set these variables in the server process or an ignored env file, **not in chat or committed files**:

- `GOOGLE_CLIENT_ID`: Web client ID ending in `.apps.googleusercontent.com`.
- `GOOGLE_CLIENT_SECRET`: Web client secret.
- `AUTH_PUBLIC_URL`: public HTTPS origin, or `http://127.0.0.1:8787` for local development. No path/query/userinfo.
- `RUST_SOUND_NEON_URL`: PostgreSQL connection URL. TLS certificate validation is always enabled.
- `RUST_SOUND_JWT_SECRET`: independently generated random signing secret, at least 32 bytes; rotation invalidates existing JWTs.
- Optional `HOST` (default `127.0.0.1`) and `PORT` (default `8787`).

Register exactly `AUTH_PUBLIC_URL/auth/google/callback` in Google Cloud authorized redirect URIs. Configure consent-screen audience/test users and request only `openid email profile`. Google Calendar/Gemini services are not connected by this login.

From this directory: `npm ci --ignore-scripts`, then `node --env-file=/absolute/path/to/server-only.env start.mjs`. The server does a read-only connection check, but **never runs DDL**. Deployment/reverse-proxy/HTTPS setup is an operator action. Reverse proxies must provide their own public rate limiting; the built-in rate limiter uses direct peer IP and never trusts attacker-supplied forwarded headers. Default loopback listener is intentional.

Review `schema.sql` against the **actual existing database** before any operator-authorized execution. `CREATE TABLE IF NOT EXISTS` does not reconcile incompatible existing columns or constraints. Existing duplicate case-insensitive emails fail closed; resolve manually before account linking. Session rows contain JWT digests only. A maintenance job can delete expired session rows; never log bearer tokens, callback query strings, Google codes or DB URLs. Configure reverse-proxy access logs accordingly.

## Desktop

Set the public `RUST_SOUND_AUTH_URL` to the backend origin before `pnpm rebuild:app`; it is the only auth backend configuration embedded in the desktop. An unset URL leaves login explicitly unavailable, not mocked. Native Keychain stores the bearer under a backend-specific account namespace; frontend receives profile only. Existing mock localStorage profiles/tokens are discarded. If cancel races with successful native completion, the late session is revoked and its Keychain entry discarded. If that cleanup is offline, the UI reports the failure and still removes the local entry; the unreachable server session expires normally. Confirmed ordinary sign-out instead retains local state on network failure so revocation can be retried.

Previous desktop code contained credential defaults. **Rotate the formerly embedded Neon password and signing secret through your provider**, then update server-only configuration. Removing source defaults cannot revoke old app bundles or git copies. No rotation, production SQL or backend deployment is automated here.

## Checks and acceptance

`npm test` runs offline token-signature, claim, handoff, replay, revocation and HTTP-boundary tests using an ephemeral RSA key and in-memory test doubles only. `AUTH_TEST_DATABASE_URL=... AUTH_TEST_DATABASE_CONFIRM=disposable node --test repository.test.mjs` additionally exercises repository persistence against an explicitly supplied disposable TLS PostgreSQL database with reviewed schema. It uses unique test identities and cleans up its own rows; never point it at production.

Live acceptance (operator authorization required): start configured backend, sign in from the installed app, finish Google consent, verify actual users/identities/session rows, restart backend/app and restore profile, confirm logout, verify revoked token no longer works. Cancel/denied consent/unavailable backend must not authenticate. Until performed, live Google/Neon behavior remains **unverified** and the OpenSpec change must stay active.

Current OAuth handoff state is bounded in-memory storage: run a single backend instance. Restart cancels pending login; persisted sessions survive. Use shared TTL storage before horizontal scaling. JWTs expire after seven days; no refresh token or Google API access token is retained.
