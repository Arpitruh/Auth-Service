# Phase 3: Verified app context + isolated tenant database routing

## Scope

The existing `/api/v1/auth/*` routes still operate on the legacy
`DATABASE_URL` unchanged. Phase 3 introduces new **server-to-server BFF-only**
`/api/v2/tenant/*` routes. This is not OIDC, not hosted login, and not an
anonymous browser SDK. Never bundle a tenant API key into browser/mobile JS.

## Security model

1. After a tenant DB has been provisioned and activated, a **trusted operator**
   calls `issueApplicationKey(appId, label)` from a backend-only action.
   The API key is shown once; only its SHA-256 digest is persisted in the
   central control database. Operators can revoke it through
   `revokeApplicationKey(appId, digest)`. The public `clientId` is **not**
   authentication.
2. A trusted application server uses `x-auth-client-id` and
   `x-auth-client-key`. Both are required to resolve the active app,
   non-revoked backend key, READY database binding and secret reference.
   Suspended apps are denied even with previously valid keys.
3. The tenant pool resolves only the control-plane-verified `secretRef`,
   decrypts the tenant DB URL internally, checks isolation policy, and
   leases one bounded Prisma connection per verified app.
4. Tokens are issued with a **separate** `TENANT_JWT_SECRET` and have
   issuer, audience, `appId` and `jti` claims. The wrong application
   and old legacy auth endpoints reject these tokens.

## Internal API

```
POST /api/v2/tenant/register    {email,password} → {user,accessToken}
POST /api/v2/tenant/login       {email,password} → {user,accessToken}
GET  /api/v2/tenant/me          Authorization: Bearer <tenant-access-token>
```

All require the backend-only app ID and key headers. The user password must
flow from browser through the trusted application's backend; use HTTPS,
no request body logging, and appropriate CSRF controls on the BFF. Phase 3
does not yet provide tenant refresh-token rotation, long-lived sessions,
password reset, social OAuth, hosted login, or dashboard UI. Tokens are
short-lived (15 minutes). The server must obtain a new token by login until
tenant refresh/session flows are built in a later phase.

## Connection management

`TENANT_POOL_MAX_CLIENTS` (default 6) caps the number of active tenant
Prisma clients per Auth instance, each using at most
`TENANT_POOL_CONNECTIONS_PER_APP` (default 2) database connections.
`TENANT_POOL_IDLE_MS` controls idle eviction. If all slots are in use,
new tenants fail closed instead of opening unlimited connections.
A deployment with multiple Auth instances must account for the aggregate
pool size. Prefer pooled Neon connections for application runtime credentials,
and direct connections for database migrations.

## Configuration

```dotenv
CONTROL_PLANE_DATABASE_URL=postgresql://... # separate control DB
CONTROL_PLANE_ENCRYPTION_KEY=...             # 32-byte base64 key
TENANT_JWT_SECRET=...                        # independent 32+ character key
TENANT_TOKEN_ISSUER=https://auth.example.com/tenant
TENANT_POOL_MAX_CLIENTS=6
TENANT_POOL_CONNECTIONS_PER_APP=2
TENANT_POOL_IDLE_MS=60000
REDIS_URL=...                                # shared per-app login throttles
```

Do not enable this in production without reviewing session revocation, OIDC
PKCE, API-key leakage controls, IP anti-abuse, provider egress restrictions and
per-app operator permissions. This phase's CI uses isolated ephemeral
PostgreSQL databases; no live Neon tenant creation is performed.

## Upcoming phase

Build OIDC Authorization Code + PKCE, hosted login, user session lifecycle,
asymmetric signing/JWKS and client SDKs so browsers never need backend API keys.
