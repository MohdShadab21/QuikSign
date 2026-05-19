-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SignatureFieldType" ADD VALUE 'NAME';
ALTER TYPE "SignatureFieldType" ADD VALUE 'FIRST_NAME';
ALTER TYPE "SignatureFieldType" ADD VALUE 'LAST_NAME';
ALTER TYPE "SignatureFieldType" ADD VALUE 'EMAIL_ADDRESS';
ALTER TYPE "SignatureFieldType" ADD VALUE 'COMPANY';
ALTER TYPE "SignatureFieldType" ADD VALUE 'TITLE';
ALTER TYPE "SignatureFieldType" ADD VALUE 'TEXT';
ALTER TYPE "SignatureFieldType" ADD VALUE 'CHECKBOX';
