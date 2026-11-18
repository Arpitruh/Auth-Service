-- Central control-plane database only. Never store user passwords or tenant user records here.
-- Provision with CONTROL_PLANE_DATABASE_URL, separate from legacy DATABASE_URL.
BEGIN;
CREATE TABLE IF NOT EXISTS "ControlApplication" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId" text NOT NULL UNIQUE,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT'
    CHECK ("status" IN ('DRAFT','ACTIVE','SUSPENDED')),
  "ssoEnabled" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "ControlRedirectUri" (
  "applicationId" uuid NOT NULL REFERENCES "ControlApplication"("id") ON DELETE CASCADE,
  "uri" text NOT NULL,
  PRIMARY KEY ("applicationId", "uri")
);
CREATE TABLE IF NOT EXISTS "ControlDatabaseBinding" (
  "applicationId" uuid PRIMARY KEY REFERENCES "ControlApplication"("id") ON DELETE CASCADE,
  "provider" text NOT NULL CHECK ("provider" IN ('NEON','POSTGRESQL')),
  "mode" text NOT NULL CHECK ("mode" IN ('MANAGED','EXTERNAL')),
  -- Secret-manager reference only; never a raw connection URL or password.
  "secretRef" text,
  "provisionState" text NOT NULL DEFAULT 'PENDING'
    CHECK ("provisionState" IN ('PENDING','PROVISIONING','READY','ERROR','DISABLED')),
  "schemaVersion" text,
  "lastErrorCode" text,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ready_requires_secret" CHECK ("provisionState" <> 'READY' OR "secretRef" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "ControlApplication_status_idx" ON "ControlApplication" ("status");
COMMIT;
