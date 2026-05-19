-- CreateTable
CREATE TABLE "SigningPreset" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ownerName" TEXT,
    "orgId" TEXT,
    "label" TEXT NOT NULL,
    "signatureValue" TEXT,
    "sealValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SigningPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SigningPreset_ownerEmail_idx" ON "SigningPreset"("ownerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "SigningPreset_ownerEmail_label_key" ON "SigningPreset"("ownerEmail", "label");
