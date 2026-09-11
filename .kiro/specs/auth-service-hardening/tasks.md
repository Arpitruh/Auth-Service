# Implementation Plan

> **Status (Phase 2 execution):** All tasks implemented. The project type-checks
> (`tsc --noEmit`), builds (`prisma generate && tsc`), boots, and the unit test
> suite passes (33 passed, 2 DB-gated integration tests skipped).
>
> **Deviation from plan — Redis:** No Redis was provisioned in the working
> environment, so instead of `ioredis`/`rate-limit-redis` the shared state
> (denylist + lockout) sits behind a `KvStore` interface (`src/lib/kv.ts`) with
> an in-memory implementation. A `createKvStore(REDIS_URL)` factory is the single
> swap point for a real Redis impl. This is correct for one instance/tests but
> NOT multi-instance safe (see Requirement 11.2) until Redis is wired.
>
> **Verification caveat:** the Postgres database (Neon) was unreachable from the
> build environment, so anything requiring a live DB — applying the migration and
> the integration tests (full flow, reuse→family revocation over HTTP, lockout
> window, session revocation) — is written but NOT run here. Reuse→family
> revocation IS proven at the service layer via unit tests with a mocked Prisma
> (`tests/unit/reuse-detection.test.ts`).

- [x] 1. Foundation: dependencies, KV (Redis-ready), logger, request tracing
- [x] 1.1 Add and pin dependencies
  - Added `zod`, `pino`, `pino-http`, `pino-pretty`, `express-rate-limit`, `swagger-ui-express`; dev deps `vitest`, `supertest`, `@types/supertest`. (Redis deps deferred; see status note.)
  - _Requirements: 12.3_

- [x] 1.2 Create KV store wrapper (`src/lib/kv.ts` + `src/lib/store.ts`)
  - `KvStore` interface + `InMemoryKvStore` (real TTL) + `createKvStore(REDIS_URL)` factory; `denylist` (`add`/`has`) and `lockout` helpers in `store.ts`
  - _Requirements: 4.2, 4.3, 11.2_

- [x] 1.3 Create structured logger (`src/lib/logger.ts`)
  - pino instance with redaction of `password`, `token`, `authorization`, `cookie`
  - _Requirements: 10.1_

- [x] 1.4 Add request-id middleware (`src/middlewares/request-id.ts`) and wire pino-http
  - Read/generate `x-request-id`, attach to `req`, echo in response header and logs
  - _Requirements: 12.7_

- [x] 2. Configuration hardening
- [x] 2.1 Convert `src/config/env.ts` to Zod-validated, fail-fast config
  - Aggregates missing/invalid vars into one error and `process.exit(1)`; added Redis, password policy, rate-limit, lockout, DB pool, previous JWT secret vars
  - _Requirements: 10.2, 11.3, 12.1, 12.4_

- [x] 2.2 Create `.env.example`
  - Documents every required and optional variable
  - _Requirements: 12.1_

- [x] 3. Data model and migrations
- [x] 3.1 Update `prisma/schema.prisma`
  - Added `revokedAt`, `replacedByToken`, `device`, `ip` to `RefreshToken`; `@@index([token])` + `@@index([userId])`; `PasswordResetToken` model + `User.resetTokens`. (Also removed the Prisma-7-invalid `url` from the datasource block.)
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 3.2 Generate and review the Prisma migration
  - `prisma generate` run; migration hand-authored (additive-only) at `prisma/migrations/20260911120000_hardening_token_lifecycle/`. NOT applied — DB unreachable; apply with `prisma migrate deploy`.
  - _Requirements: 9.5, 11.6_

- [x] 4. Token security core
- [x] 4.1 Add SHA-256 hashing helper (`src/lib/hash.ts`)
  - `sha256(input)` hex digest + `randomToken()`; unit-tested for determinism
  - _Requirements: 1.1, 1.2_

- [x] 4.2 Add `jti` to access tokens and previous-secret grace in `src/lib/jwt.ts`
  - `signAccessToken` generates jti and returns `{token, jti}`; `verifyWithGrace` tries current then optional previous secret
  - _Requirements: 4.1, 12.4_

- [x] 4.3 Rework refresh persistence to store hashes
  - `issueTokens` stores `sha256(refreshToken)` keyed by jti; captures device/ip
  - _Requirements: 1.1, 1.3_

- [x] 4.4 Implement rotation with mark-revoked model
  - `/refresh` marks old row `revokedAt` + `replacedByToken`, issues a new pair
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 4.5 Implement reuse detection and family revocation
  - Missing/revoked/hash-mismatch → `revokeFamily(userId)` (updateMany), structured `token_reuse` log, 401 `TOKEN_REUSE`. Proven in `tests/unit/reuse-detection.test.ts`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4.6 Implement access-token denylist on logout
  - `/logout` adds access `jti` to the KV denylist with TTL = remaining life; `requireAuth` rejects denylisted jti
  - _Requirements: 4.2, 4.3, 4.4, 11.1_

- [x] 5. Validation, normalization, and password policy
- [x] 5.1 Create Zod schemas (`src/schemas/auth.schema.ts`)
  - register/login/forgot-password/reset-password/update-role; email `.trim().toLowerCase()`; password policy from env
  - _Requirements: 5.1, 5.3, 5.4_

- [x] 5.2 Create validation middleware (`src/middlewares/validate.ts`)
  - Parses body, replaces `req.body`, or 400 `VALIDATION_ERROR` before controllers
  - _Requirements: 5.1, 5.2_

- [x] 5.3 Apply validation to routes and remove inline checks
  - `validate(schema)` wired on register/login/forgot/reset/role; inline service checks removed
  - _Requirements: 5.1, 5.2_

- [x] 6. Brute-force and CSRF defense
- [x] 6.1 Add rate limiting (`src/middlewares/rate-limit.ts`)
  - `express-rate-limit`, key = IP(+`ipKeyGenerator` for IPv6)+email, 5/15min, on `/login`, `/register`, `/forgot-password`. (Memory store; swap `rate-limit-redis` when REDIS_URL set.)
  - _Requirements: 6.1, 6.5, 11.2_

- [x] 6.2 Implement account lockout
  - Per-email KV counter; locks after N consecutive failures; resets on success
  - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [x] 6.3 Enforce CSRF via SameSite=Strict refresh cookie (no token middleware)
  - `refreshCookieOptions()` keeps `sameSite: 'strict'`, `httpOnly`, `secure` in prod, path `/api/v1/auth`; decision + reasoning documented in `auth.controller.ts`
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 7. New endpoints
- [x] 7.1 Session management
  - `GET /sessions` lists active sessions (current flagged via jti); `DELETE /sessions/:id` revokes owner's session only (ownership enforced in WHERE)
  - _Requirements: 8.3, 8.4_

- [x] 7.2 Password reset
  - `forgot-password` issues single-use short-TTL hashed token, delivery logged (dev), always 200; `reset-password` verifies token, updates password, marks used, revokes all refresh tokens
  - _Requirements: 8.5, 8.6, 9.4_

- [x] 7.3 Admin endpoints (`src/routes/admin.routes.ts`)
  - `GET /admin/users`, `PATCH /admin/users/:id/role` gated by `requireRole('ADMIN')`; role changes logged
  - _Requirements: 8.7, 10.1_

- [x] 7.4 Health and readiness endpoints
  - `/health` liveness (no deps); `/ready` pings DB (`SELECT 1`) + KV, 503 on failure
  - _Requirements: 8.8_

- [x] 8. Error handling and API docs
- [x] 8.1 Standardize error responses
  - `HttpError` gained `code`; handler moved to `src/middlewares/error-handler.ts`; serializes `{ error: { code, message, requestId } }`; maps Zod + Prisma `P2002`
  - _Requirements: 10.3, 11.5_

- [x] 8.2 Generate and serve OpenAPI/Swagger
  - Hand-authored OpenAPI 3.1 (`src/docs/openapi.ts`) served at `/docs` via swagger-ui-express
  - _Requirements: 10.4_

- [x] 9. Scalability and lifecycle
- [x] 9.1 Configure Prisma connection pool (`src/lib/prisma.ts`)
  - Pool `max` set from `DB_POOL_SIZE` on the pg adapter
  - _Requirements: 11.3_

- [x] 9.2 Implement graceful shutdown (`src/server.ts`)
  - SIGTERM/SIGINT: stop accepting, drain, `prisma.$disconnect()`, `kv.close()`, exit (10s force timer). Verified at runtime.
  - _Requirements: 11.4_

- [x] 9.3 Ensure idempotent register
  - Relies on unique email constraint; maps `P2002` to 409 `EMAIL_EXISTS`
  - _Requirements: 11.5_

- [x] 10. Containerization
- [x] 10.1 Add multi-stage Dockerfile and `.dockerignore`
  - Builder + runtime stages; non-root `node` user; `npm prune --omit=dev`; HEALTHCHECK on `/health`
  - _Requirements: 12.6_

- [x] 11. Testing
- [x] 11.1 Set up Vitest + Supertest
  - `vitest.config.ts` + `tests/setup.ts`; `test` script = `vitest run`
  - _Requirements: 13.1, 13.2_

- [x] 11.2 Unit tests (all passing)
  - hash, jwt (sign/verify/jti/ttl), kv (TTL), rotation + reuse detection + family revocation (mocked Prisma), lockout (mocked), Zod schemas, boot-fails-on-missing-env
  - _Requirements: 13.1_

- [x] 11.3 Integration tests (written; DB-gated)
  - register→login→refresh→logout, reuse→family revocation, cookie SameSite=Strict/HttpOnly asserts; self-skip without a reachable DB (`RUN_DB_TESTS` + connectivity probe). `/health` integration test runs and passes.
  - _Requirements: 13.2_
