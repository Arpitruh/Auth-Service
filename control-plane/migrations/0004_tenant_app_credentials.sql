-- Backend-only client credentials for Phase 3 tenant routing.
-- Store only SHA-256 digest; raw keys are handed to an operator exactly once.
CREATE TABLE IF NOT EXISTS "ControlApplicationCredential" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "applicationId" uuid NOT NULL REFERENCES "ControlApplication"("id") ON DELETE CASCADE,
  "keyDigest" char(64) NOT NULL UNIQUE,
  "label" varchar(100) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "revokedAt" timestamptz,
  "lastUsedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "ControlApplicationCredential_app_idx"
  ON "ControlApplicationCredential" ("applicationId") WHERE "revokedAt" IS NULL;
