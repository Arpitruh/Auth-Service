# Design Document

## Overview

This design hardens the existing auth-service into a production-ready, horizontally scalable authentication microservice. It builds on the current Express 5 + TypeScript + Prisma + PostgreSQL + Argon2 + JWT stack and adds Redis for shared state (access-token denylist, rate-limit and lockout counters).

The core security posture: **access tokens are stateless and short-lived; refresh tokens are stateful, hashed at rest, rotated on every use, and revocable per-family.** Immediate revocation of access tokens is achieved with a Redis denylist keyed by `jti`.

The design deliberately reuses existing building blocks — `src/config/env.ts` fail-fast loader, `src/lib/jwt.ts`, `requireAuth`/`requireRole` in `auth.middleware.ts`, and the centralized error handler in `server.ts` — extending rather than replacing them.

## Architecture

### High-Level Request Flow

```
Client
  │
  ▼
[requestId] → [pino-http logger] → [cors] → [json + cookieParser]
  │
  ├── /health              (liveness, no deps)
  ├── /ready               (checks DB + Redis)
  │
  ▼
[rate-limit (Redis store)]  ── on /login, /register
  │
  ▼
[Zod validation middleware] ── per-route body schema
  │
  ▼
[requireAuth] → [denylist check (Redis)] → [requireRole]  ── on protected routes
  │
  ▼
Controller → Service → (Prisma / Redis)
  │
  ▼
[centralized error handler → { error: { code, message } }]
```

### Component Layers
- **Routes** (`src/routes/*`): wire middleware chains to controllers. New: `admin.routes.ts`, session/reset routes added to `auth.routes.ts`.
- **Controllers** (`src/controllers/*`): HTTP translation only; no business logic.
- **Services** (`src/services/*`): business logic. New: `session.service.ts`, `password-reset.service.ts`, `admin.service.ts`; extend `auth.service.ts`.
- **Lib** (`src/lib/*`): `jwt.ts`, `prisma.ts`, `errors.ts`, plus new `redis.ts`, `hash.ts`, `logger.ts`.
- **Middlewares** (`src/middlewares/*`): `auth.middleware.ts` (extended with denylist), new `validate.ts`, `rate-limit.ts`, `request-id.ts`, `error-handler.ts`.
- **Config** (`src/config/env.ts`): extended with Zod validation and new vars.

### Why Redis
Requirement 11 mandates shared state across instances. In-memory stores (denylist, rate-limit counters) diverge when multiple instances run behind a load balancer. Redis provides a single source of truth with native TTL support — ideal for `jti` denylist entries expiring exactly at token expiry.

## Components and Interfaces

### 1. Token Security

#### Hashing (`src/lib/hash.ts`)
```ts
export function sha256(input: string): string; // hex digest, for token lookup keys
```
Refresh tokens and reset tokens are hashed with SHA-256 before persistence. SHA-256 (not Argon2) is used for tokens because they are high-entropy random values where a fast, deterministic hash suffices and enables indexed lookup. Passwords continue to use Argon2.

#### Access token `jti` (extend `src/lib/jwt.ts`)
`AccessTokenPayload` gains a `jti: string`. `signAccessToken` generates a `randomUUID()` jti. The denylist middleware reads `payload.jti` and checks Redis.

#### Refresh rotation & reuse detection (extend `auth.service.ts`)
Rotation flow on `/refresh`:
1. Verify JWT signature; hash the presented token.
2. Look up `RefreshToken` by `jti` (from payload).
3. If the row is missing OR `revokedAt` is set OR the stored hash != presented hash → **reuse detected**: revoke the entire family (`deleteMany`/mark `revokedAt` for all rows with that `userId`), log the event, reject with 401.
4. Otherwise: mark the row `revokedAt = now`, `replacedByToken = <new hash>`; issue a new pair; persist the new hashed token.

This upgrades the existing delete-on-rotate logic to a **mark-revoked** model, which is what makes reuse detection possible (a deleted row can't be distinguished from a never-existed one).

#### Denylist (`src/lib/redis.ts` + `auth.middleware.ts`)
```ts
denylist.add(jti: string, ttlSeconds: number): Promise<void>;
denylist.has(jti: string): Promise<boolean>;
```
Key: `denylist:<jti>`, value `1`, `EX = remaining token life`. `requireAuth` calls `denylist.has(payload.jti)` after signature verification and rejects if present.

### 2. Validation & Normalization (`src/middlewares/validate.ts`, `src/schemas/*`)
```ts
export const validate = (schema: ZodSchema) =>
  (req, res, next) => { /* parse req.body, replace with parsed, or 400 */ };
```
Schemas in `src/schemas/auth.schema.ts`: `registerSchema`, `loginSchema`, `resetPasswordSchema`, `forgotPasswordSchema`, `updateRoleSchema`. Email fields use `.transform(v => v.trim().toLowerCase())`. Password fields enforce policy from env (`PASSWORD_MIN_LENGTH`, `PASSWORD_REQUIRE_NUMBER`, `PASSWORD_REQUIRE_SYMBOL`).

### 3. Brute-Force & CSRF

#### Rate limiting (`src/middlewares/rate-limit.ts`)
`express-rate-limit` with `rate-limit-redis` store. Key = `IP + ':' + email`. Applied to `/login` and `/register`. Defaults: 5 / 15 min (configurable via env).

#### Account lockout (in `auth.service.ts` + Redis)
Redis counter `lockout:<email>`. On failed login: `INCR` + set expiry. When count ≥ `LOCKOUT_THRESHOLD`, reject with a locked error until the window elapses. Successful login deletes the counter.

#### CSRF
CSRF for cookie-based flows is handled entirely by the refresh cookie's `SameSite=Strict` attribute — no double-submit token middleware. Because the cookie is `SameSite=Strict`, the browser will not attach it to any cross-site request, so a malicious origin cannot drive `/refresh`, `/logout`, or session revocation on the user's behalf. The cookie stays `httpOnly`, `secure` in production, and path-scoped to `/api/v1/auth` (existing behavior in `refreshCookieOptions()` is retained).

This trades a small amount of cross-site flexibility (a first-party frontend on a different origin cannot use the cookie flow) for a simpler, dependency-free CSRF posture. If a cross-origin frontend is introduced later, reintroduce a double-submit token and relax the cookie to `SameSite=Lax`.

### 4. New Endpoints

| Method | Path | Middleware | Handler |
|---|---|---|---|
| GET | `/api/v1/auth/me` | requireAuth + denylist | authController.me |
| POST | `/api/v1/auth/refresh` | (SameSite=Strict cookie) | authController.refresh |
| GET | `/api/v1/auth/sessions` | requireAuth + denylist | sessionController.list |
| DELETE | `/api/v1/auth/sessions/:id` | requireAuth + denylist | sessionController.revoke |
| POST | `/api/v1/auth/forgot-password` | validate(forgot) + rate-limit | passwordResetController.forgot |
| POST | `/api/v1/auth/reset-password` | validate(reset) | passwordResetController.reset |
| GET | `/api/v1/admin/users` | requireAuth + requireRole('ADMIN') | adminController.listUsers |
| PATCH | `/api/v1/admin/users/:id/role` | requireAuth + requireRole('ADMIN') + validate | adminController.updateRole |
| GET | `/health` | none | liveness |
| GET | `/ready` | none | readiness (DB + Redis ping) |

Sessions list returns `{ id, createdAt, expiresAt, device?, ip? }` derived from `RefreshToken` rows where `revokedAt IS NULL`. Device/IP captured at issuance when available.

### 5. Data Model (`prisma/schema.prisma`)

```prisma
model User {
  id            String              @id @default(uuid())
  email         String              @unique
  password      String
  role          String              @default("USER")
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  refreshTokens RefreshToken[]
  resetTokens   PasswordResetToken[]
}

model RefreshToken {
  id              String    @id @default(uuid())   // == jti
  token           String    @unique                // SHA-256 hash, never plaintext
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt       DateTime  @default(now())
  expiresAt       DateTime
  revokedAt       DateTime?                         // NEW
  replacedByToken String?                           // NEW (hash of successor)
  device          String?                           // optional capture
  ip              String?                           // optional capture

  @@index([token])
  @@index([userId])
}

model PasswordResetToken {
  id        String    @id @default(uuid())
  tokenHash String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  usedAt    DateTime?

  @@index([userId])
}
```

Migrations delivered via `prisma migrate` with a reviewed history. Additive-first (add nullable columns/new model) so existing rows remain valid — a zero-downtime-safe change.

### 6. Observability & Ops

- **Logger** (`src/lib/logger.ts`): pino instance; `pino-http` middleware attaches per-request child logger with `requestId`. Redaction configured for `password`, `token`, `authorization`, `cookie`.
- **Env validation** (`src/config/env.ts`): replace ad-hoc `required()` with a Zod schema parsed at import time; on failure, print the aggregated missing/invalid vars and `process.exit(1)`. Keeps existing fail-fast behavior but with clearer aggregated errors.
- **Error shape**: centralized handler in `server.ts` (moved to `src/middlewares/error-handler.ts`) maps `HttpError` and Zod errors to `{ error: { code, message } }`. `HttpError` gains a `code` field (e.g. `INVALID_CREDENTIALS`, `TOKEN_REUSE`, `VALIDATION_ERROR`).
- **OpenAPI**: generate a Swagger doc (e.g. `zod-to-openapi` from the Zod schemas, or hand-authored `openapi.yaml`) served at `/docs`.

### 7. Request Tracing (`src/middlewares/request-id.ts`)
Reads incoming `x-request-id` or generates a UUID; stores on `req`, echoes in the response header, and includes it in every log line and error body.

### 8. Scalability
- **Stateless access verification**: `requireAuth` does JWT verify + Redis denylist check only — no DB read.
- **Prisma pool**: set `connection_limit` via `DATABASE_URL` query param / datasource config, driven by `DB_POOL_SIZE` env.
- **Graceful shutdown** (`src/server.ts`): capture the `http.Server`; on `SIGTERM`/`SIGINT`, stop accepting connections, await in-flight, then `prisma.$disconnect()` and `redis.quit()`, then exit.
- **Idempotent register**: rely on the `email` unique constraint; catch Prisma `P2002` and return 409 (`EMAIL_EXISTS`).

### 9. Secret Rotation (Requirement 12.4)
`jwt.ts` verification tries the current secret, then a `JWT_ACCESS_SECRET_PREVIOUS` / `JWT_REFRESH_SECRET_PREVIOUS` (optional env) for a grace window. Signing always uses the current secret.

### 10. Containerization
Multi-stage `Dockerfile` (builder installs deps + `npm run build`; runtime copies `dist` + prod deps, runs as non-root `node` user). `.dockerignore` excludes `node_modules`, `.env`, tests, `.git`.

## Data Models
See section 5 for the Prisma schema. Redis key namespaces:
- `denylist:<jti>` → access-token denylist (TTL = remaining life).
- `ratelimit:<ip>:<email>` → express-rate-limit-redis counters.
- `lockout:<email>` → consecutive failed-login counter (TTL = lockout window).

## Error Handling
- All errors flow to the centralized handler and are serialized as `{ error: { code, message, requestId } }`.
- `HttpError(statusCode, code, message)` for expected failures; unknown errors log full detail server-side and return a generic `INTERNAL_ERROR` 500.
- Zod validation errors map to 400 `VALIDATION_ERROR` with the first issue's message (details logged, not necessarily returned, to avoid leaking schema internals).
- Reuse detection returns 401 `TOKEN_REUSE` after family revocation.
- Login failure / unknown user return the same 401 `INVALID_CREDENTIALS` to avoid user enumeration; forgot-password always returns 200 regardless of whether the email exists.

## Testing Strategy
- **Framework**: Vitest (aligns with the ESM/tsx setup) with Supertest for HTTP integration.
- **Unit**: `hash` (sha256 determinism), `jwt` (sign/verify, jti, previous-secret grace), rotation + reuse logic (mocked Prisma/Redis), Argon2 password hashing/verify, Zod schemas (email normalization, password policy).
- **Integration**: spin up service against a test Postgres + Redis (or containers); cover register → login → refresh → logout, refresh rotation invalidating the old token, reuse triggering family revocation, account lockout after N failures, `/sessions` listing and `/sessions/:id` revocation, and denylist immediate logout. Also assert the refresh cookie is set with `SameSite=Strict`, `HttpOnly`, and the correct path.
- **Boot test**: assert the process exits non-zero when a required env var is absent.
