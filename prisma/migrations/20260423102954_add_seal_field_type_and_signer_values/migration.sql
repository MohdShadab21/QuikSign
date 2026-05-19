-- AlterEnum
ALTER TYPE "SignatureFieldType" ADD VALUE 'SEAL';

-- AlterTable
ALTER TABLE "Signer" ADD COLUMN     "sealValue" TEXT,
ADD COLUMN     "signatureValue" TEXT;
