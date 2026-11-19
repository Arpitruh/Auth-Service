# Auth Garden production operations

## Health endpoints

- `GET /health`: process liveness only (suitable for Render's container health check).
- `GET /ready`: checks PostgreSQL and Redis with an actual `PING` round-trip. Returns HTTP 503 and a **sanitized** per-component status on failure. Keep `/ready` for operational checks; avoid treating a temporary Redis outage as a reason to restart an otherwise healthy container.

## Safe debugging

Set `LOG_LEVEL=debug` temporarily in the private Render environment for more structured logs; revert to `info` afterwards. Never log operator passwords, password hashes, cookies, connection strings, Redis URLs, or raw exceptions returned by external services.

To debug a Redis outage, look for `Redis connection failure` (category / error code only) and `readiness_redis_fail`. For a dashboard failure, inspect `Dashboard session store failure` without posting raw request headers or secrets. Example, **optional commented logger snippet** for local-only debugging:

```ts
// Enable only while troubleshooting, then comment it out again.
// logger.debug({ event: 'redis_probe', ready: await kv.ping() }, 'Redis PING diagnostic');
```

**Never uncomment `console.log(process.env.REDIS_URL)` or full `console.error(error)` in production.** Driver error messages can contain credentials.

## Operator account and password recovery

The operator's password hash is held in `DASHBOARD_OPERATOR_PASSWORD_HASH`, not in a self-service user table. The `/dashboard/recover` page provides a guided operator-assisted reset. There is deliberately **no unauthenticated email reset endpoint** until a verified recovery identity and one-time-token delivery mechanism exist.

To rotate the administrator password:
1. Generate a new Argon2id hash in a trusted terminal using the installed `argon2` dependency.
2. Update only `DASHBOARD_OPERATOR_PASSWORD_HASH` in Render. Never paste raw passwords into logs, tickets, or chat.
3. Redeploy and sign in using the original password (not its hash).
4. Existing operator sessions are revoked **manually** by removing their Redis session keys if required; merely changing the hash does not instantly terminate all previously issued sessions.

Redis credentials exposed in previous logs must be rotated in Upstash and the updated TLS URL stored only in Render.

## Before enabling tenant provisioning

Verify `CONTROL_PLANE_ENCRYPTION_KEY` is exactly 32 secure random bytes encoded as Base64 and stable across redeploys. Keep the control-plane DB distinct from the legacy auth DB. Managed Neon provisioning requires a configured Neon API key and explicit operator approval. Avoid creating billable Neon resources during basic UI smoke tests.

## Smoke checks

- Anonymous `/` redirects through `/dashboard` to `/dashboard/login`.
- Valid operator login sets an HttpOnly/SameSite=Strict cookie and opens the dashboard.
- The sidebar Sign out button submits a CSRF-protected POST, revokes the Redis session, and redirects to sign in.
- Invalid origin / CSRF inputs fail closed. A missing Redis connection returns a 503 (not a silent in-memory fallback).
- `/dashboard/recover` shows recovery instructions; it never accepts or echoes an operator password.
