import { countPdfPages } from "@/lib/documents/pdf-page-count";
import {
  convertOfficeUploadToPdfForSigning,
  pdfDisplayNameFromUpload,
  uploadedNameIsOfficeFormat,
} from "@/lib/documents/convert-office-to-pdf";
import { isPdfUpload } from "@/lib/documents/pdf-upload-policy";

export type ProcessedDocumentUpload = {
  /** PDF used for preview, field placement, and signing (original bytes for PDF uploads). */
  signingPdfBuffer: Buffer;
  signingPdfFileName: string;
  pageCount: number;
  conversionMethod: string;
  /** Original upload bytes when Word — upload to Cloudinary in parallel with signing PDF. */
  originalUploadBuffer?: Buffer;
  originalFileName?: string;
};

export async function processDocumentUpload(
  buffer: Buffer,
  fileName: string,
): Promise<ProcessedDocumentUpload> {
  if (isPdfUpload(fileName)) {
    const pageCount = await countPdfPages(buffer);
    return {
      signingPdfBuffer: buffer,
      signingPdfFileName: fileName,
      pageCount,
      conversionMethod: "pdf-original",
    };
  }

  if (!uploadedNameIsOfficeFormat(fileName)) {
    throw new Error("Unsupported file type. Upload PDF or Word (.docx, .doc).");
  }

  const { pdf, method } = await convertOfficeUploadToPdfForSigning(buffer, fileName);
  const signingPdfFileName = pdfDisplayNameFromUpload(fileName);
  const pageCount = await countPdfPages(pdf);

  return {
    signingPdfBuffer: pdf,
    signingPdfFileName,
    pageCount,
    conversionMethod: method,
    originalUploadBuffer: buffer,
    originalFileName: fileName,
  };
}
