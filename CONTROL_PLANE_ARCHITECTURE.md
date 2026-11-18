# Database-per-application control plane — Phases 1 and 2

Status: separate registry and internal tenant provisioning foundation. This implementation deliberately **does not** route
existing login/refresh requests to arbitrary tenant databases. Legacy Auth
continues to use `DATABASE_URL` unchanged, so no existing user is migrated.

## Isolation model

- **Control plane**: a **separate** `CONTROL_PLANE_DATABASE_URL` PostgreSQL
  database holding app metadata, public client IDs, exact allowed redirects,
  provisioning state, settings and security audit events. **No app users,
  passwords, OAuth tokens, or tenant refresh sessions.**
- **Tenant identity data plane** (next milestone): a separate, versioned Auth
  database for EACH application, created in a dedicated Neon project by a
  privileged provisioner or connected by reference. Provisioning is implemented as an internal service; tenant auth routing is future work.
- **Application business data plane**: owned by the consuming application;
  not accessed directly by the central Auth Service.

No SSO is enabled: `ssoEnabled` defaults to false, `status` starts
`DRAFT`, and `provisionState` starts `PENDING`. App activation requires
a READY database binding, a secret-manager reference, and a schema version.

## Setting up a dedicated central registry

1. Provision a **new** PostgreSQL database independent of existing
   `DATABASE_URL`. Do not point `CONTROL_PLANE_DATABASE_URL` at the legacy
   database even through a different connection string.
2. Set `CONTROL_PLANE_DATABASE_URL` **on the Auth Service backend only**.
   Never expose credentials in the frontend or put them in Git.
3. Apply migrations using `npm run control:migrate`. The script keeps a
   checksum-based `ControlSchemaMigration` ledger and serializes migration
   sessions using a PostgreSQL advisory lock. Re-run is idempotent; changed
   previously applied migration files are rejected.
4. Current application registration is an **internal server-side API**
   (`registerApplication` in `src/control-plane/registry.ts`). It is
   **not** an unauthenticated HTTP endpoint or an existing GUI.
5. Internal lifecycle operations in `src/control-plane/lifecycle.ts` can
   mark a tenant DB ready, activate an app after validation, and suspend it.
   They will be exposed to the dashboard only after operator authentication,
   authorization, CSRF protection and audited access controls exist.

### Developer example

```ts
import { registerApplication } from './src/control-plane/registry.js';
const application = await registerApplication({
  slug: 'my-app',
  name: 'My App',
  redirectUris: ['https://my-app.example.com/auth/callback'],
  provider: 'NEON',
  mode: 'MANAGED',
});
console.log(application.clientId, application.status);
// authapp_... DRAFT; no database created yet.
```

The public `clientId` is **not** an authentication credential. An OAuth
authorization request must validate the client registration, redirect URI and
PKCE, and user credentials before issuing tokens. Do not accept a client ID
from arbitrary browser headers to choose a tenant DB.

## Database provisioning lifecycle (Phase 2)

```
DRAFT app created → PENDING binding → PROVISIONING
  → Neon project/database provisioned
  → app-specific secret ref stored in secure secret manager
  → tenant schema migration applied and health tested
  → READY binding + schemaVersion → ACTIVE app
```

The current `secretRef` field is intentionally restricted to a reference
such as `secret://apps/abc`; database passwords and raw connection strings
**must not be saved in the registry**. Provisioner credentials must live in a
secret manager with tightly scoped privileges. In case of failure, leave app
unavailable and preserve audit records; do not fall back to the legacy DB.

## Future architecture safeguards

- Per-app OAuth issuer/client/audience and asymmetric signing keys or issuer
  design, with public JWKS and verified PKCE.
- Verified, server-established app context for every data-plane request.
- Bounded idle-evicting tenant DB pools and separate readiness checks.
- Per-app Redis prefixes for rate limits/revocation/session state.
- Tenant database schema version ledger, canary migrations and rollback plans.
- App database backup/restore and key rotation procedures.
- Authenticated dashboard operators and app-specific permissions, with
  independent operator identity from tenant user records.
- Preserve old Auth API until apps are explicitly migrated.

## CI verification

GitHub Actions provisions PostgreSQL `auth_ci` for legacy users and a separate
`auth_control_ci` database for the registry. It runs both migration
chains, full legacy Auth tests, redirect-policy tests, and control-plane
isolation/lifecycle tests. The private registry connection is optional in
existing deployments so live Auth remains unaffected by this phase.
