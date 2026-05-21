import path from "node:path";
import { convertOfficeBufferToPdfViaGotenberg, gotenbergConversionConfigured } from "@/lib/documents/convert-gotenberg";
import { convertOfficeBufferToPdfDirect } from "@/lib/documents/convert-libreoffice-direct";
import {
  convertOfficeBufferToPdfViaMicrosoftGraph,
  microsoftGraphConversionConfigured,
} from "@/lib/documents/convert-microsoft-graph";
import { withOfficeConversionLock } from "@/lib/documents/office-conversion-lock";
import {
  convertOfficeBufferToPdfViaMicrosoftWord,
  microsoftWordConversionEnabled,
} from "@/lib/documents/convert-word-microsoft";
import { resolveSofficeBinaryPaths } from "@/lib/documents/libreoffice-paths";

export function uploadedNameIsOfficeFormat(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".docx") || lower.endsWith(".doc");
}

/** Stored document name after conversion (always .pdf). */
export function pdfDisplayNameFromUpload(fileName: string): string {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext) || "document";
  return `${stem}.pdf`;
}

export type OfficeConversionMethod =
  | "microsoft-graph"
  | "gotenberg"
  | "microsoft-word"
  | "libreoffice";

export type OfficeConversionResult = {
  pdf: Buffer;
  method: OfficeConversionMethod;
};

export const WORD_CONVERSION_UNAVAILABLE_MESSAGE =
  "Could not convert Word to PDF. For Word Online only (no desktop Word): ask IT to configure Microsoft Graph (see docs/MICROSOFT_GRAPH_SETUP.md). Or set GOTENBERG_URL for production, LIBRE_OFFICE_EXE locally, or upload PDF from Word Online: Download as PDF.";

/**
 * Converts Word → PDF for signing only. Original .docx is never edited.
 * Priority: Microsoft Graph (Word Online) → Gotenberg → desktop Word → LibreOffice.
 */
export async function convertOfficeUploadToPdfForSigning(
  buffer: Buffer,
  originalFileName: string,
): Promise<OfficeConversionResult> {
  return withOfficeConversionLock(async () => {
    if (microsoftGraphConversionConfigured()) {
      try {
        const pdf = await convertOfficeBufferToPdfViaMicrosoftGraph(buffer, originalFileName);
        return { pdf, method: "microsoft-graph" };
      } catch (graphErr) {
        if (!gotenbergConversionConfigured() && !microsoftWordConversionEnabled()) {
          const sofficePaths = resolveSofficeBinaryPaths();
          if (sofficePaths.length === 0) {
            throw graphErr;
          }
        }
      }
    }

    if (gotenbergConversionConfigured()) {
      const pdf = await convertOfficeBufferToPdfViaGotenberg(buffer, originalFileName);
      return { pdf, method: "gotenberg" };
    }

    if (microsoftWordConversionEnabled()) {
      try {
        const pdf = await convertOfficeBufferToPdfViaMicrosoftWord(buffer, originalFileName);
        return { pdf, method: "microsoft-word" };
      } catch {
        // fall through to LibreOffice
      }
    }

    const sofficePaths = resolveSofficeBinaryPaths();
    if (sofficePaths.length > 0) {
      const pdf = await convertOfficeBufferToPdfDirect(buffer, originalFileName);
      return { pdf, method: "libreoffice" };
    }

    throw new Error(WORD_CONVERSION_UNAVAILABLE_MESSAGE);
  });
}

/** @deprecated Use {@link convertOfficeUploadToPdfForSigning}. */
export const convertOfficeUploadToPdf = convertOfficeUploadToPdfForSigning;
