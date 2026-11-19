CREATE TABLE "registration_event_outbox" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "deliveredAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "registration_event_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "registration_event_outbox_userId_key" ON "registration_event_outbox"("userId");
CREATE INDEX "registration_event_outbox_deliveredAt_nextAttemptAt_idx" ON "registration_event_outbox"("deliveredAt", "nextAttemptAt");
ALTER TABLE "registration_event_outbox" ADD CONSTRAINT "registration_event_outbox_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
