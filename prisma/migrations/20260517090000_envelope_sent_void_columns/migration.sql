-- AlterTable
ALTER TABLE "Envelope" ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "voidReason" TEXT;

-- Backfill sentAt from updatedAt for already-sent envelopes
UPDATE "Envelope" SET "sentAt" = "updatedAt" WHERE "sentAt" IS NULL AND "status" <> 'DRAFT';
