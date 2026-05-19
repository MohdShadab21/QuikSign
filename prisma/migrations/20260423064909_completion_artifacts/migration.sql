-- AlterTable
ALTER TABLE "Envelope" ADD COLUMN     "completionCertificateCloudinaryId" TEXT,
ADD COLUMN     "completionCertificateUrl" TEXT,
ADD COLUMN     "signedCloudinaryId" TEXT,
ADD COLUMN     "signedDocumentUrl" TEXT;
