-- Dedicated control-plane database only. Encrypted connection URLs are NOT stored in the binding table.
CREATE TABLE IF NOT EXISTS "ControlSecret" (
  "id" text PRIMARY KEY,
  "ciphertext" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "ControlProvisioningAttempt" (
  "applicationId" uuid PRIMARY KEY REFERENCES "ControlApplication"("id") ON DELETE CASCADE,
  "providerResourceId" text,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "finishedAt" timestamptz,
  "lastErrorCode" text
);
