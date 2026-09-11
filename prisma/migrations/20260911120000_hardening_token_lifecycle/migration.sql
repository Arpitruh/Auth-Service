-- Phase 2 hardening: additive, zero-downtime-safe changes.
-- Adds refresh-token lifecycle columns, indexes, and the PasswordResetToken model.

-- AlterTable: RefreshToken lifecycle + optional capture fields (all nullable,
-- so existing rows remain valid without backfill).
ALTER TABLE "RefreshToken" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN "replacedByToken" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "device" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "ip" TEXT;

-- CreateIndex: speed up lookups by hashed token and by owner.
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateTable: PasswordResetToken
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
