-- AlterTable
ALTER TABLE "TemplateField" ADD COLUMN     "assignedRole" "FieldAssignedRole" NOT NULL DEFAULT 'RECIPIENT',
ADD COLUMN     "label" TEXT,
ADD COLUMN     "prefillValue" TEXT,
ADD COLUMN     "prefilledBySender" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "readOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "valueType" "SignatureFieldValueType" NOT NULL DEFAULT 'SIGNATURE',
ADD COLUMN     "zIndex" INTEGER NOT NULL DEFAULT 1;
