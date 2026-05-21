import { isSupportedDocumentUpload, uploadRejectionMessage } from "@/lib/documents/pdf-upload-policy";

/** Returns an error message when the file must not be uploaded, or null when OK. */
export function validateDocumentUploadFile(file: File): string | null {
  if (!isSupportedDocumentUpload(file.name, file.type)) {
    return uploadRejectionMessage(file.name, file.type);
  }
  return null;
}
