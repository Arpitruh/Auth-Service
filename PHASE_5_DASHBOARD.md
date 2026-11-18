# Phase 5 — Auth Garden Dashboard

Auth Garden is an **opt-in operator control panel** at `/dashboard` in
the existing Express Auth Service. Its visual design uses precisely these
colors: cream `#EBEBD8`, olive `#637545`, forest `#455230`, sage
`#9BA685`. It uses server-rendered HTML and no browser-held API keys.

## Features implemented
- Secure operator username + Argon2id password, expiring **HTTP-only**
  SameSite=Strict cookie sessions, server-side session storage in Redis.
- Per-IP login throttling, CSRF token on state-changing actions, same-origin
  verification where `Origin` is supplied, CSP and anti-framing headers.
- Application overview and registration. Every app defaults to **DRAFT**
  and SSO disabled. Registering does not provision any paid resources.
- Choose a managed dedicated Neon project or connect a dedicated, empty
  TLS PostgreSQL database; validate and migrate it before activation.
- Managed-Neon provision requires a separate explicit cost-approval checkbox.
  **Never automatically retry** a failed/ambiguous Neon create request.
- Review public client IDs, callback allowlists, schema versions and status.
- Activate ready apps; suspend active apps. Create a one-time backend API key
  for an ACTIVE app without putting it in browser JS.
- Password login / registration toggles, enforced on existing tenant and
  hosted OIDC login endpoints. Session-duration setting is stored but
  enforcement of a custom per-app token lifetime remains future work.
- Per-app active user directory (first 100 users), role change and audit events.
  Tenant user records and password hashes never enter the central registry.

## Enable locally or in a protected staging deployment
Use an isolated control database with migrations already applied:

```bash
npm run control:migrate
node -e "require('argon2').hash('YOUR_NEW_STRONG_PASSWORD').then(console.log)"
```

Set the resulting Argon2id hash and these **private backend** variables:
```dotenv
CONTROL_PLANE_DATABASE_URL=postgresql://.../auth_control?sslmode=require
CONTROL_PLANE_ENCRYPTION_KEY=<backed-up-32-byte-base64-key>
REDIS_URL=rediss://...
DASHBOARD_OPERATOR_USERNAME=<operator-login-name>
DASHBOARD_OPERATOR_PASSWORD_HASH=<argon2id-hash>
```

Then open `/dashboard/login`. In production the panel is deliberately a
**404** unless all operator credentials, control database and Redis are
configured. Do not use your app's user credentials to log into the dashboard.
The operator is isolated from all application-user databases.

### Provisioning
Managed Neon provisioning additionally requires a backend-only
`NEON_API_KEY`, optional `NEON_ORG_ID`, explicit cost confirmation and
a compatible server runtime able to launch Prisma CLI migrations.
Existing PostgreSQL connection requires a separate empty DB, SSL, and its
host suffix present in `TENANT_DATABASE_ALLOWED_DOMAINS` if not Neon.
Use trusted provider hostnames only and enforce outbound network egress
policies to mitigate DNS rebinding / SSRF.

### Limitations and security review before production
- This is an **initial operator dashboard**, not a self-service multi-team
  portal. One environment-configured operator identity, no MFA or audit export.
- There is no application-level dashboard staff invitation, key list/rotation
  UI, SSO switch, social provider configuration, custom branding editor,
  advanced pagination or comprehensive tenant session management yet.
- Do not treat per-app session-duration preferences as enforced until
  explicit tenant session/token policy is implemented.
- Provisioning runs synchronously inside an HTTP request; a separate
  provisioning worker with progress/recovery UI is needed for large workloads.
- Current OIDC is an early standards-shaped subset and must undergo independent
  security/conformance and live staging tests before broad deployment.
- Staging verification uses disposable PostgreSQL/Redis resources.
  No real Neon projects are created by CI; no production deployment is made.
- Review external DB SSRF protections, secrets manager integration, key
  rotation, concurrency controls and MFA before exposing the operator panel
  to the public Internet.

## Branch policy
All Phase 5 changes stay on the existing
`feat/reusable-auth-consumers` branch. `main` is untouched.
