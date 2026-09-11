# Requirements Document

## Introduction

The auth-service is a standalone authentication microservice (Node/Express/TypeScript/Prisma/PostgreSQL/Argon2/JWT) that currently supports register, login, logout, refresh, and a `/me` endpoint. Because other applications will depend on this service, several items previously slated for a "Future Roadmap" are being pulled into Phase 1 — they are not optional for a service other apps integrate against.

This document defines the security, functional, operational, and scalability requirements to make the auth-service production-ready. Scope covers token security hardening, input validation, brute-force and CSRF defense, new endpoints, data-model additions, observability, scalability, and testing.

### Existing Baseline (already implemented)
- Register / login / logout / refresh with Argon2 password hashing and JWT access/refresh tokens.
- Refresh token persisted with a `jti` linking the JWT to its DB row; basic rotation (delete-on-use) and reuse rejection.
- `GET /api/v1/auth/me` behind `requireAuth`; `requireRole` middleware for role gating.
- Fail-fast env reads via `required()` in `src/config/env.ts`; `GET /health` returning `{ status: "ok" }`.
- httpOnly, sameSite=strict refresh cookie scoped to `/api/v1/auth`.

This spec hardens and extends that baseline; requirements below either add new behavior or strengthen existing behavior.

---

## Requirements

### Requirement 1: Refresh Token Hashing at Rest

**User Story:** As a security engineer, I want refresh tokens stored only as hashes, so that a database compromise does not leak usable tokens.

#### Acceptance Criteria
1. WHEN a refresh token is persisted THEN the system SHALL store a SHA-256 hash of the token in `RefreshToken.token`, never the plaintext.
2. WHEN a refresh token is presented for lookup THEN the system SHALL hash the presented token and compare against the stored hash.
3. WHEN scanning the entire database THEN the system SHALL contain no plaintext refresh tokens or reset tokens anywhere.

### Requirement 2: Refresh Token Rotation

**User Story:** As a user, I want each refresh to issue a new token and retire the old one, so that a stolen token has a limited useful lifetime.

#### Acceptance Criteria
1. WHEN a valid `/refresh` request is processed THEN the system SHALL issue a new access/refresh pair.
2. WHEN a new refresh token is issued during rotation THEN the system SHALL immediately invalidate the presented token (mark `revokedAt` and set `replacedByToken`).
3. WHEN rotation completes THEN the previously presented refresh token SHALL never validate again.

### Requirement 3: Reuse Detection and Family Revocation

**User Story:** As a security engineer, I want reuse of a rotated token treated as a compromise, so that a leaked token cannot be exploited across a session family.

#### Acceptance Criteria
1. WHEN an already-used or already-revoked refresh token is presented THEN the system SHALL treat it as a compromise signal.
2. WHEN a compromise is detected THEN the system SHALL revoke the entire token family (all refresh tokens for that `userId`).
3. WHEN a family is revoked THEN the affected user SHALL be forced to re-login.
4. WHEN reuse detection triggers THEN the system SHALL emit a structured log event for the reuse detection.

### Requirement 4: Access Token Denylist

**User Story:** As a user, I want logout to invalidate my access token immediately, so that I am not exposed for the remainder of its 15-minute lifetime.

#### Acceptance Criteria
1. WHEN an access token is issued THEN it SHALL carry a unique `jti` claim.
2. WHEN `/logout` or an admin force-logout occurs THEN the system SHALL add the access token `jti` to a Redis denylist with TTL equal to the token's remaining lifetime.
3. WHEN a request presents an access token whose `jti` is on the denylist THEN the system SHALL reject the request as unauthorized.
4. WHEN a denylist entry's TTL expires THEN the entry SHALL be removed automatically.

### Requirement 5: Input Validation and Normalization

**User Story:** As a developer, I want all request bodies validated before business logic runs, so that malformed or malicious input is rejected consistently.

#### Acceptance Criteria
1. WHEN any request with a body reaches `register`, `login`, or `reset-password` THEN the system SHALL validate it against a Zod schema in middleware before the controller runs.
2. IF validation fails THEN the system SHALL return a standardized error response and SHALL NOT touch business logic.
3. WHEN an email is used for uniqueness checks or lookups THEN the system SHALL normalize it to lowercase (and trim) first.
4. WHEN a password is submitted THEN the system SHALL enforce a policy of minimum length 8 with at least one number and one symbol, configurable via environment variables.

### Requirement 6: Brute-Force Defense

**User Story:** As a security engineer, I want repeated login/register attempts throttled and abusive accounts locked, so that credential-stuffing is impractical.

#### Acceptance Criteria
1. WHEN requests hit `/login` or `/register` THEN the system SHALL apply rate limiting (default 5 attempts / 15 minutes per IP+email combination).
2. WHEN a login fails THEN the system SHALL increment a per-email failed-attempt counter.
3. WHEN failed attempts reach a configurable threshold N THEN the system SHALL temporarily lock the account.
4. WHEN a successful login occurs THEN the system SHALL reset that account's failed-attempt counter.
5. WHEN rate-limit and lockout counters are stored THEN they SHALL live in Redis so they hold across multiple instances.

### Requirement 7: CSRF Protection for Cookie Flows

**User Story:** As a user, I want state-changing requests that rely on my refresh cookie protected against CSRF, so that a malicious site cannot act on my behalf.

#### Acceptance Criteria
1. WHEN the refresh cookie is issued THEN it SHALL use `SameSite=Strict` so the browser never attaches it to cross-site requests, which is the primary CSRF defense for cookie-based flows.
2. WHEN the refresh cookie is issued THEN it SHALL remain `httpOnly` and, in production, `secure`, and SHALL be path-scoped to `/api/v1/auth`.
3. WHEN a cross-site request attempts to invoke a cookie-based state-changing endpoint THEN the browser SHALL NOT send the refresh cookie, so the request SHALL be treated as unauthenticated.

### Requirement 8: New Endpoints

**User Story:** As an integrating service, I want a complete, documented endpoint surface, so that I can rely on a stable contract.

#### Acceptance Criteria
1. WHEN `GET /api/v1/auth/me` is called with a valid access token THEN the system SHALL return the current user (id, email, role).
2. WHEN `POST /api/v1/auth/refresh` is called THEN the system SHALL rotate tokens per Requirements 2 and 3.
3. WHEN `GET /api/v1/auth/sessions` is called THEN the system SHALL list the current user's active refresh-token sessions (id, createdAt, expiresAt, and device/IP when captured).
4. WHEN `DELETE /api/v1/auth/sessions/:id` is called THEN the system SHALL revoke that specific session and SHALL only allow the owner to revoke their own session.
5. WHEN `POST /api/v1/auth/forgot-password` is called THEN the system SHALL create a single-use, short-TTL reset token stored hashed, and SHALL deliver it via a stubbed/logged mechanism.
6. WHEN `POST /api/v1/auth/reset-password` is called with a valid, unexpired, unused token THEN the system SHALL update the password, mark the token used, and invalidate all refresh tokens for that user.
7. WHEN `GET /api/v1/admin/users` or `PATCH /api/v1/admin/users/:id/role` is called THEN the system SHALL require `role: ADMIN` and reject others with 403.
8. WHEN `GET /health` and `GET /ready` are called THEN the system SHALL return health/readiness suitable for Docker/AWS load-balancer checks (`/ready` reflecting DB/Redis connectivity).

### Requirement 9: Data Model Additions

**User Story:** As an auditor, I want an audit trail for token lifecycle and reset tokens, so that rotation and reuse can be investigated.

#### Acceptance Criteria
1. WHEN the `RefreshToken` model is updated THEN it SHALL add nullable `revokedAt` and `replacedByToken` fields.
2. WHEN a `PasswordResetToken` model is added THEN it SHALL contain id, tokenHash, userId (FK, cascade delete), expiresAt, and nullable usedAt.
3. WHEN the schema is updated THEN it SHALL add indexes on `RefreshToken.token` and `RefreshToken.userId`.
4. WHEN a password is changed or reset THEN the system SHALL invalidate all existing refresh tokens for that user.
5. WHEN schema changes are applied THEN they SHALL be delivered as reviewed Prisma migrations (never `db push` in production).

### Requirement 10: Observability and Ops

**User Story:** As an operator, I want structured logs, fail-fast config, consistent errors, and an API contract, so that the service is diagnosable and safe to run.

#### Acceptance Criteria
1. WHEN notable events occur (login success/failure, token refresh, reuse detection, session revocation, role changes) THEN the system SHALL emit structured logs (pino) and SHALL never log raw passwords or tokens.
2. WHEN the service boots THEN it SHALL validate required env vars (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, and others) and SHALL crash immediately with a clear error if any are missing.
3. WHEN any endpoint returns an error THEN the response SHALL follow the shape `{ "error": { "code": string, "message": string } }`.
4. WHEN the API surface is defined THEN the system SHALL generate an OpenAPI/Swagger spec for it.

### Requirement 11: Scalability

**User Story:** As an operator, I want the service to scale horizontally behind a load balancer, so that it stays correct and available under load.

#### Acceptance Criteria
1. WHEN an access token is verified THEN verification SHALL be fully stateless (no DB hit); only refresh/revocation checks may touch shared state (DB/Redis).
2. WHEN denylist and rate-limit state is stored THEN it SHALL live in Redis (shared), not in process memory.
3. WHEN Prisma connects to Postgres THEN the connection pool size SHALL be configured explicitly for expected concurrency (PgBouncer considered as instance count grows).
4. WHEN the process receives `SIGTERM`/`SIGINT` THEN it SHALL drain in-flight requests and close DB/Redis connections cleanly before exit.
5. WHEN duplicate `/register` submissions arrive THEN the system SHALL remain safe via a unique constraint and return 409 on conflict.
6. WHEN migrations are planned THEN they SHALL follow a zero-downtime approach (additive first, backfill, then drop).

### Requirement 12: Additional Best Practices

**User Story:** As a maintainer, I want config, dependency, secret, versioning, and container practices established, so that the service is operable and secure long-term.

#### Acceptance Criteria
1. WHEN configuration is needed THEN all secrets/config SHALL come from environment variables (12-factor), with a `.env.example` documenting every required var.
2. WHEN the service connects to Postgres THEN it SHOULD use a least-privilege DB role separate from migration-runner credentials where possible.
3. WHEN dependencies are managed THEN the lockfile SHALL be committed and automated auditing (npm audit / Dependabot or Renovate) SHALL be enabled.
4. WHEN JWT secrets are rotated THEN the system SHALL support verifying against a previous secret for a grace window so sessions are not all invalidated at once.
5. WHEN the API evolves THEN the `/api/v1/` prefix SHALL be retained and a documented deprecation policy SHALL exist for future versions.
6. WHEN the service is containerized THEN it SHALL use a multi-stage Dockerfile, run as a non-root user, and include a `.dockerignore`.
7. WHEN a request is processed THEN a request ID SHALL be attached to every log line and error response for tracing across services.

### Requirement 13: Testing

**User Story:** As a maintainer, I want unit and integration coverage of security-critical flows, so that regressions are caught before release.

#### Acceptance Criteria
1. WHEN unit tests run THEN they SHALL cover token generation/verification, rotation logic, reuse detection, and password hashing.
2. WHEN integration tests run THEN they SHALL cover the full register → login → refresh → logout flow, account lockout, and session revocation.

---

## Global Acceptance Criteria
- No plaintext tokens are stored anywhere in the database.
- A used refresh token can never be successfully reused; reuse triggers family revocation.
- Cookie-based state-changing endpoints are protected from CSRF via a `SameSite=Strict` refresh cookie (the browser withholds it on cross-site requests).
- All request bodies are validated before business logic runs.
- The service exposes `/health` and crashes on boot (not a silent failure) if required env vars are absent.
