# Using Auth Service from any backend

This service exposes a reusable identity API for your Next.js, Express, mobile
backend or other service. It is **not** an OAuth/OIDC provider and has a
**global user database and global USER/ADMIN roles**. Do not use its global
role as permission to access resources in another app. Each app must authorize
workspace membership, record ownership and other app-specific rules.

## 1. Configure the Auth Service

Set these in the **Auth Service** deployment (Render or another backend host):

```dotenv
# Optional: multi-origin browser allowlist; comma-separated, exact HTTP(S) origins.
CLIENT_ORIGINS=https://crm.example.com,https://jobs.example.com,http://localhost:3000

# Backend-only API keys for token introspection. Use independent random
# 32+ character keys for consumers; comma-separated during key rotation.
INTROSPECTION_API_KEYS=<crm-backend-only-key>,<jobs-backend-only-key>
```

Keep JWT_ACCESS_SECRET and JWT_REFRESH_SECRET only in the Auth Service. Avoid
`NEXT_PUBLIC_` prefixes for secrets, committing secrets, or exposing them
in browser JavaScript. No database schema migration is required for this API.

If INTROSPECTION_API_KEYS is unset, introspection is disabled (HTTP 503).
Incorrect service credentials return HTTP 401.

## 2. Validate an existing user session from another backend

The app obtains an access token from login:

```
POST /api/v1/auth/login
{ "email": "someone@example.com", "password": "..." }
→ { "user": {...}, "accessToken": "..." }
```

Then an **application backend** validates it:

```bash
curl -X POST "$AUTH_SERVICE_URL/api/v1/auth/introspect" \
  -H "x-auth-service-key: $AUTH_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"token":"<access-token>"}'
```

Valid, active access token:

```json
{ "active": true, "sub": "user-id", "email": "user@example.com",
  "role": "USER", "token_type": "access_token", "exp": 1790000000 }
```

Expired, invalid, revoked or deleted user: `{"active":false}`.
A backend must **fail closed** if the Auth Service cannot be reached or returns
a non-2xx status. Do not send refresh tokens to introspection.

## 3. Next.js App Router server-side helper

In `lib/check-auth.ts` (server-only code, never a Client Component):

```ts
import "server-only";

type Identity = { sub: string; email: string; role: string; exp: number };

export async function checkAuth(accessToken: string): Promise<Identity | null> {
  const url = process.env.AUTH_SERVICE_URL;
  const key = process.env.AUTH_SERVICE_KEY;
  if (!url || !key) throw new Error("Auth service not configured");

  const response = await fetch(`${url}/api/v1/auth/introspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-auth-service-key": key },
    body: JSON.stringify({ token: accessToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const result = await response.json();
  if (!result.active || !result.sub || !result.email || !result.exp) return null;
  return { sub: result.sub, email: result.email, role: result.role, exp: result.exp };
}
```

Read `Authorization: Bearer <token>` in the Next.js Route Handler before
calling this helper. Look up business/workspace permissions in **your app DB**
using the returned `sub`, not its global role.

## 4. Express middleware example

```ts
import type { Request, Response, NextFunction } from "express";

export async function requireIdentity(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) { res.status(401).json({ error: "No token" }); return; }
  try {
    const response = await fetch(
      `${process.env.AUTH_SERVICE_URL}/api/v1/auth/introspect`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-service-key": process.env.AUTH_SERVICE_KEY!,
        },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(5000),
      },
    );
    const data = response.ok ? await response.json() : { active: false };
    if (!data.active) { res.status(401).json({ error: "Invalid token" }); return; }
    res.locals.identity = data;
    next();
  } catch { res.status(503).json({ error: "Auth provider unavailable" }); }
}
```

## 5. Frontend and mobile constraints

- CORS allows approved *origins* to read responses; it does not grant access,
  provide CSRF protection, or make refresh cookies cross-site compatible.
- Refresh cookies remain HttpOnly, SameSite=Strict and scoped to
  `/api/v1/auth`. For different top-level sites, use an app-specific
  same-origin BFF/reverse proxy with a carefully designed session layer.
- Native/mobile refresh-token transport is a future capability; do not put
  server API keys or long-lived refresh credentials in browser/mobile bundles.
- JWT signing remains symmetric; the introspection endpoint avoids distributing
  the JWT secret. Full issuer/audience-specific tokens and JWKS are future work.
- Introspection checks the current role and denylist; consumers should not
  cache positive results if immediate revocation is important.
- Rotating backend keys: temporarily configure two independent keys, update
  the consuming backend, then remove the old key.
- REDIS_URL is not currently backed by a Redis KV implementation. Logout
  denylist and lockout counters are process-local until shared storage is built.
- The password-reset delivery path is a development stub. Integrating the
  Notification Service for production email comes later.
