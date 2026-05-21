/** Legal-grade uploads: PDF stored unchanged; Word stored unchanged with LibreOffice PDF for signing only. */

export const PDF_ONLY_UPLOAD_MESSAGE =
  "Upload a PDF or Word file (.pdf, .docx, .doc). PDFs are unchanged. Word is converted to PDF for signing (Microsoft 365 / Word Online via Graph, or desktop Word/LibreOffice when configured) — your .docx is not edited; only signature fields are drawn on the PDF.";

export const DOCUMENT_UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

/** @deprecated Use DOCUMENT_UPLOAD_ACCEPT */
export const PDF_ONLY_ACCEPT = DOCUMENT_UPLOAD_ACCEPT;

export function isOfficeUpload(fileName: string, mimeType?: string): boolean {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
    return true;
  }
  const mime = (mimeType ?? "").toLowerCase();
  return (
    mime === "application/msword"
    || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

export function isPdfUpload(fileName: string, mimeType?: string): boolean {
  if (isOfficeUpload(fileName, mimeType)) {
    return false;
  }
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".pdf")) {
    return true;
  }
  const mime = (mimeType ?? "").toLowerCase();
  return mime === "application/pdf";
}

export function isSupportedDocumentUpload(fileName: string, mimeType?: string): boolean {
  return isPdfUpload(fileName, mimeType) || isOfficeUpload(fileName, mimeType);
}

export function uploadRejectionMessage(fileName: string, mimeType?: string): string {
  if (!isSupportedDocumentUpload(fileName, mimeType)) {
    return PDF_ONLY_UPLOAD_MESSAGE;
  }
  return PDF_ONLY_UPLOAD_MESSAGE;
}
