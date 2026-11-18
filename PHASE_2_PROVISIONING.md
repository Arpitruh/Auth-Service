# Phase 2 — Tenant database provisioning (internal foundation)

Neon project-per-app and connect-existing-PostgreSQL provisioning are implemented
as **internal APIs only**. No management/dashboard HTTP route exists yet. No
real Neon project is automatically created by deployment or CI.

## Setup prerequisites
- `CONTROL_PLANE_DATABASE_URL`: dedicated central control database
- `CONTROL_PLANE_ENCRYPTION_KEY`: random 32-byte key encoded in base64, held
  only in the backend secret manager. Back it up carefully: losing it prevents
  decrypting all stored tenant connections. Rotation requires a re-encryption plan.
- `NEON_API_KEY`: required only for managed Neon project creation; store in
  the server's secret manager, never in the dashboard/browser.
- `NEON_ORG_ID`: optional org ID when using a personal API key.
- Apply `npm run control:migrate` to the control-plane DB.

## How provisioning works
1. `registerApplication()` creates a DRAFT app with a PENDING binding.
2. Trusted internal `provisionTenant({mode:'MANAGED',applicationId})` requests
   its own Neon project. Or `provisionTenant({mode:'EXTERNAL',applicationId,
   connectionUrl})` attaches an isolated PostgreSQL database.
3. Verify TLS and database target isolation; refuse any nonempty tenant DB.
4. Run existing Prisma Auth migrations against the dedicated tenant DB.
5. Encrypt its connection string using AES-256-GCM in `ControlSecret`, while
   storing only `secret://apps/<uuid>` in the application binding.
6. Transition database binding to READY with schema version. A trusted operator
   can then call `activateApplication`.

**Safety:** attempts are claimed only once. A timeout or unknown Neon API
create result is marked ERROR; it must be manually reconciled before any retry
because a project may already have been created. Project IDs are recorded
where a successful create response provides one. Never auto-delete a project
after a failure, as it may contain data. Do not run this on a business DB.

## Operational limitations / Phase 3 dependencies
- The current production `/api/v1/auth/*` paths still use legacy DATABASE_URL.
  There is **no** browser-accessible tenant routing or public provisioning API.
- A central authenticated admin dashboard, app-specific OAuth/OIDC with PKCE,
  and a bounded tenant connection manager are not implemented here.
- Existing connection support intentionally requires a **dedicated, empty,
  SSL-enabled PostgreSQL database** with sufficient migration permissions.
- Neon API has project quotas and possible charges. An explicit operator
  approval/confirmation and cost display should be implemented before putting
  the create action in any dashboard.
- For high-value production usage, move encrypted secrets into a managed secret
  manager, add DNS egress allowlisting and network/SSRF controls, and introduce
  dedicated runtime DB roles rather than relying on migration credentials.
- CI covers the control-plane secret encryption and store, plus legacy tests.
  No live Neon API project create, Neon billing, or paid-provider calls.
