-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EnvelopeStatus" ADD VALUE 'VOIDED';
ALTER TYPE "EnvelopeStatus" ADD VALUE 'DECLINED';
ALTER TYPE "EnvelopeStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
ALTER TYPE "SignerStatus" ADD VALUE 'DECLINED';

-- AlterTable
ALTER TABLE "Envelope" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "declinedReason" TEXT,
ADD COLUMN     "message" TEXT,
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Signer" ADD COLUMN     "declinedAt" TIMESTAMP(3);
