-- Application configuration and immutable lifecycle audit. No end-user data.
CREATE TABLE IF NOT EXISTS "ControlApplicationSettings" (
  "applicationId" uuid PRIMARY KEY REFERENCES "ControlApplication"("id") ON DELETE CASCADE,
  "allowPasswordLogin" boolean NOT NULL DEFAULT true,
  "allowRegistration" boolean NOT NULL DEFAULT true,
  "requireEmailVerification" boolean NOT NULL DEFAULT true,
  "sessionMinutes" integer NOT NULL DEFAULT 60 CHECK ("sessionMinutes" BETWEEN 5 AND 10080),
  "settingsVersion" integer NOT NULL DEFAULT 1,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "ControlApplicationEvent" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "applicationId" uuid NOT NULL REFERENCES "ControlApplication"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "actor" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ControlApplicationEvent_app_created_idx"
  ON "ControlApplicationEvent" ("applicationId", "createdAt" DESC);
