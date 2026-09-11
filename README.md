# Auth Service

A production-ready authentication and session-management service built with Express 5, TypeScript, Prisma 7 (PostgreSQL), and JWTs. It provides registration, login, refresh-token rotation with reuse detection, password reset, session management, and role-based admin endpoints.

Live demo: `https://login-service-8akx.onrender.com` (free tier — the first request after idle may take ~30-60s to cold-start).

## Features

- **Email + password auth** with Argon2 password hashing.
- **JWT access tokens** (short-lived) returned in the response body.
- **Refresh tokens** stored as an httpOnly, `SameSite=Strict` cookie, with **rotation** and **reuse detection** (a replayed refresh token revokes the whole token family).
- **Configurable password policy** (min length, require number, require symbol).
- **Rate limiting** on `/login` and `/register` (per IP + email).
- **Account lockout** after repeated failed logins.
- **Password reset** via time-limited tokens.
- **Session management**: list active sessions and revoke individual ones.
- **Role-based access control** (`USER` / `ADMIN`) with admin-only endpoints.
- **Health & readiness probes** for load balancers (`/health`, `/ready`).
- **Fail-fast config validation** (Zod) — the service refuses to boot with invalid env.
- **Structured logging** (pino) with per-request IDs.
- **OpenAPI/Swagger docs** served at `/docs`.

## Tech stack

| Concern        | Choice                                  |
| -------------- | --------------------------------------- |
| Runtime        | Node.js 20+                             |
| Web framework  | Express 5                               |
| Language       | TypeScript                              |
| ORM / DB       | Prisma 7 + PostgreSQL (pg driver adapter) |
| Auth           | jsonwebtoken, argon2                    |
| Validation     | zod                                     |
| Logging        | pino / pino-http                        |
| Tests          | vitest + supertest                      |
| Container      | Docker (multi-stage, non-root)          |

## Requirements

- **Node.js 20 or newer** (the build tooling requires `styleText` from `node:util`, available in Node 20.12+).
- **PostgreSQL** database (a free [Neon](https://neon.tech) instance works well).
- Optional: **Redis** for shared rate-limit/lockout/token state across multiple instances. Without it, an in-memory fallback is used (single-instance only).

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
# then edit .env — at minimum set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

# 3. Generate the Prisma client and apply migrations
npx prisma generate
npx prisma migrate deploy   # applies existing migrations
# (for local schema changes during development, use: npx prisma migrate dev)

# 4. Run in development (auto-reload)
npm run dev

# The service listens on http://localhost:5000 by default.
```

### Useful scripts

| Script                | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `npm run dev`         | Start with hot reload (tsx watch)         |
| `npm run build`       | `prisma generate` + compile TS to `dist/` |
| `npm start`           | Run the compiled server (`dist/server.js`)|
| `npm run typecheck`   | Type-check without emitting               |
| `npm test`            | Run the test suite once (vitest)          |
| `npm run test:watch`  | Run tests in watch mode                   |

## Configuration

All configuration comes from environment variables and is validated at startup. See [`.env.example`](./.env.example) for the full list. Key variables:

| Variable                              | Required | Default                 | Description                                              |
| ------------------------------------- | -------- | ----------------------- | -------------------------------------------------------- |
| `DATABASE_URL`                        | yes      | —                       | PostgreSQL connection string.                            |
| `JWT_ACCESS_SECRET`                   | yes      | —                       | Secret for signing access tokens. Use a long random value. |
| `JWT_REFRESH_SECRET`                  | yes      | —                       | Secret for signing refresh tokens.                       |
| `JWT_ACCESS_SECRET_PREVIOUS`          | no       | —                       | Previous secret to verify during rotation grace window.  |
| `JWT_REFRESH_SECRET_PREVIOUS`         | no       | —                       | Previous refresh secret for rotation grace.              |
| `ACCESS_TOKEN_TTL`                    | no       | `15m`                   | Access token lifetime.                                   |
| `REFRESH_TOKEN_TTL`                   | no       | `7d`                    | Refresh token lifetime.                                  |
| `PORT`                                | no       | `5000`                  | Listen port (Render/most PaaS inject this).              |
| `NODE_ENV`                            | no       | `development`           | Set to `production` in prod (enables secure cookies).    |
| `CLIENT_ORIGIN`                       | no       | `http://localhost:3000` | Allowed CORS origin (your frontend URL).                 |
| `REFRESH_COOKIE_NAME`                 | no       | `refreshToken`          | Name of the refresh cookie.                              |
| `REDIS_URL`                           | no       | —                       | Shared Redis; in-memory fallback if unset.               |
| `PASSWORD_MIN_LENGTH`                 | no       | `8`                     | Minimum password length.                                 |
| `PASSWORD_REQUIRE_NUMBER`             | no       | `true`                  | Require at least one digit.                              |
| `PASSWORD_REQUIRE_SYMBOL`             | no       | `true`                  | Require at least one symbol.                             |
| `RATE_LIMIT_MAX`                      | no       | `5`                     | Max attempts per window (per IP+email).                  |
| `RATE_LIMIT_WINDOW_MINUTES`           | no       | `15`                    | Rate-limit window.                                       |
| `LOCKOUT_THRESHOLD`                   | no       | `5`                     | Failed logins before lockout.                            |
| `LOCKOUT_WINDOW_MINUTES`              | no       | `15`                    | Lockout window.                                          |
| `RESET_TOKEN_TTL_MINUTES`             | no       | `30`                    | Password-reset token lifetime.                           |
| `DB_POOL_SIZE`                        | no       | `10`                    | Max DB connections per instance.                         |
| `LOG_LEVEL`                           | no       | `info`                  | pino log level.                                          |

Generate strong secrets with:

```bash
openssl rand -base64 48
```

## API reference

Base URL: `<host>` — e.g. `http://localhost:5000` locally, or your Render URL in production.

Interactive docs (Swagger UI): **`GET /docs`**

### Health

| Method | Path      | Auth | Description                                                    |
| ------ | --------- | ---- | ------------------------------------------------------------- |
| GET    | `/health` | none | Liveness. Always `200 {"status":"ok"}` if the process is up.  |
| GET    | `/ready`  | none | Readiness. Checks DB + KV; `200` when ready, `503` otherwise. |

### Auth (`/api/v1/auth`)

| Method | Path               | Auth   | Description                                            |
| ------ | ------------------ | ------ | ------------------------------------------------------ |
| POST   | `/register`        | none   | Create an account. Returns user + access token, sets refresh cookie. |
| POST   | `/login`           | none   | Authenticate. Returns user + access token, sets refresh cookie. |
| POST   | `/refresh`         | cookie | Rotate tokens using the refresh cookie.                |
| POST   | `/logout`          | cookie | Revoke the current session and clear the refresh cookie. |
| POST   | `/forgot-password` | none   | Request a password reset. Always returns `200`.        |
| POST   | `/reset-password`  | none   | Set a new password using a reset token.                |
| GET    | `/me`              | Bearer | Return the current user's profile.                     |
| GET    | `/sessions`        | Bearer | List the user's active sessions.                       |
| DELETE | `/sessions/:id`    | Bearer | Revoke a specific session.                             |

### Admin (`/api/v1/admin`)

Requires a valid access token **and** the `ADMIN` role.

| Method | Path                 | Description                       |
| ------ | -------------------- | --------------------------------- |
| GET    | `/users`             | List users.                       |
| PATCH  | `/users/:id/role`    | Update a user's role (`USER`/`ADMIN`). |

### Authentication model

- **Access token**: returned in the JSON response body as `accessToken`. Send it on protected routes via the `Authorization: Bearer <token>` header.
- **Refresh token**: set automatically as an httpOnly, `SameSite=Strict` cookie scoped to `/api/v1/auth`. It is `Secure` in production. Clients call `POST /refresh` (with the cookie) to obtain a new access token; each refresh rotates the token. Reusing an old refresh token revokes the entire session family.

Because the refresh cookie is `SameSite=Strict`, the service is designed for same-origin use. For a cross-origin frontend, the cookie policy would need to be relaxed and a CSRF token added (see notes in `src/controllers/auth.controller.ts`).

### Validation rules

- **Email**: trimmed and lowercased; must be a valid email address.
- **Password (register / reset)**: at least `PASSWORD_MIN_LENGTH` characters, and (by default) at least one number and one symbol.
- **Password (login)**: presence only — no policy enforced, so legacy passwords still work.

## Example usage

Replace `$BASE` with your host (e.g. `http://localhost:5000`).

```bash
# Register
curl -X POST "$BASE/api/v1/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"Passw0rd!23"}'

# Login (saves the refresh cookie to cookies.txt)
curl -c cookies.txt -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"Passw0rd!23"}'
# -> { "user": {...}, "accessToken": "<JWT>" }

# Call a protected route with the access token
curl "$BASE/api/v1/auth/me" \
  -H "Authorization: Bearer <accessToken>"

# Rotate tokens using the refresh cookie
curl -b cookies.txt -c cookies.txt -X POST "$BASE/api/v1/auth/refresh"

# Log out
curl -b cookies.txt -X POST "$BASE/api/v1/auth/logout"
```

## Running with Docker

The included multi-stage `Dockerfile` builds a lean, non-root runtime image. The container entrypoint runs `prisma migrate deploy` before starting the server.

```bash
# Build
docker build -t auth-service .

# Run (provide required env vars)
docker run --rm -p 5000:5000 \
  -e DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
  -e JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  -e JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
  -e NODE_ENV=production \
  auth-service
```

The image includes a `HEALTHCHECK` that polls `/health`.

## Deploying to Render (free tier)

This repo includes a [`render.yaml`](./render.yaml) Blueprint.

1. Create a free PostgreSQL database (e.g. on [Neon](https://neon.tech)) and copy its connection string. Prefer the pooled host for `DATABASE_URL`.
2. In the [Render dashboard](https://dashboard.render.com): **New → Blueprint**, and connect this repository. Render reads `render.yaml` and provisions a Docker web service.
3. When prompted, set the `sync: false` variables:
   - `DATABASE_URL` — from your Neon database
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — long random values
   - `CLIENT_ORIGIN` — your frontend origin
4. Deploy. The entrypoint applies migrations, then the server starts.
5. Verify:
   - `https://<your-app>.onrender.com/health` -> `{"status":"ok"}`
   - `https://<your-app>.onrender.com/ready` -> `{"status":"ready","checks":{"db":"ok","kv":"ok"}}`

> Notes: Free Render web services spin down after ~15 minutes of inactivity and cold-start on the next request. Render injects `PORT` automatically — do not hard-code it. Render's own free Postgres expires after ~30 days, which is why an external database (Neon) is recommended.

## Testing

```bash
npm test          # run once
npm run test:watch
```

The suite covers unit tests (hashing, JWT, schema validation, KV, lockout, reuse detection, env boot) and an integration test for the auth flow. Some integration cases are skipped automatically when no database is reachable.

## Project structure

```
src/
  app.ts              # Express app factory (middleware + route mounting)
  server.ts           # HTTP server bootstrap + graceful shutdown
  config/env.ts       # Zod-validated environment configuration
  controllers/        # Request handlers (auth, session, password reset, admin)
  routes/             # Route definitions (auth, admin, health)
  services/           # Business logic (auth, session, password reset, admin)
  middlewares/        # auth, validation, rate limiting, logging, errors
  schemas/            # Zod request schemas
  lib/                # prisma, jwt, hash, kv/store, logger, http, errors
  docs/openapi.ts     # OpenAPI spec for Swagger UI
prisma/               # schema.prisma + migrations
tests/                # unit + integration tests
Dockerfile            # multi-stage production build
render.yaml           # Render Blueprint
```

## Security notes

- Passwords are hashed with Argon2; plaintext is never stored.
- Refresh tokens are stored as SHA-256 hashes, never in plaintext.
- Refresh-token rotation with reuse detection mitigates token theft.
- Secrets must be provided via environment variables — never commit real `.env` values.
- In production (`NODE_ENV=production`), refresh cookies are marked `Secure`.

## License

ISC
