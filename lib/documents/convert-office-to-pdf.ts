import path, { join } from "node:path";
import { createRequire } from "node:module";
import { convertDocxToPdfViaTextFallback } from "@/lib/documents/convert-docx-fallback-pdf";

type LibreOfficeConvertModule = {
  convertWithOptions: (
    document: Buffer,
    format: string,
    filter: string | undefined,
    options: {
      fileName?: string;
      sofficeBinaryPaths?: string[];
      tmpOptions?: Record<string, unknown>;
    },
    callback: (err: NodeJS.ErrnoException | null, data: Buffer) => void,
  ) => unknown;
};

let libreOfficeConvertCached: LibreOfficeConvertModule | null = null;

/**
 * LibreOffice is opt-in via LIBRE_OFFICE_EXE. On serverless platforms like Vercel
 * the binary isn't available, so we always fall through to the mammoth-based
 * text fallback there. This keeps uploads working without surprising 500s.
 */
function libreOfficeAvailable(): boolean {
  if (process.env.LIBRE_OFFICE_EXE && process.env.LIBRE_OFFICE_EXE.trim().length > 0) {
    return true;
  }
  // Heuristic: when running on Vercel (or other serverless), don't even try.
  if (process.env.VERCEL || process.env.AWS_REGION) {
    return false;
  }
  // On local dev/self-host without an explicit binary, still attempt — `libreoffice-convert`
  // can find a system-wide install. If it fails, we fall back gracefully.
  return true;
}

function loadLibreOfficeConvert(): LibreOfficeConvertModule | null {
  if (libreOfficeConvertCached) {
    return libreOfficeConvertCached;
  }
  try {
    // Default `import` breaks under Turbopack/Next for this CJS-only package (undefined export → 500).
    const require = createRequire(join(process.cwd(), "package.json"));
    const mod = require("libreoffice-convert") as LibreOfficeConvertModule | { default: LibreOfficeConvertModule };
    if (mod && typeof (mod as LibreOfficeConvertModule).convertWithOptions === "function") {
      libreOfficeConvertCached = mod as LibreOfficeConvertModule;
      return libreOfficeConvertCached;
    }
    const interop = mod as { default?: LibreOfficeConvertModule };
    if (interop.default && typeof interop.default.convertWithOptions === "function") {
      libreOfficeConvertCached = interop.default;
      return libreOfficeConvertCached;
    }
  } catch {
    return null;
  }
  return null;
}

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

/** Temp input name for LibreOffice (must keep .doc / .docx extension). */
function officeTempFileName(originalFileName: string): string {
  const base = path.basename(originalFileName.trim()) || "document";
  const safe = base.replace(/[^\w.\-() ]+/g, "_");
  const lower = safe.toLowerCase();
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
    return safe;
  }
  return `${safe}.docx`;
}

function isMissingSofficeError(err: unknown): boolean {
  const raw = ((err as Error)?.message ?? "").toString();
  return raw.includes("Could not find soffice");
}

export type OfficeConversionMethod = "libreoffice" | "text-fallback";

export type OfficeConversionResult = {
  pdf: Buffer;
  method: OfficeConversionMethod;
};

/**
 * Converts Word to PDF. Prefers LibreOffice when available (faithful layout); otherwise uses a
 * mammoth-based text fallback so .docx uploads still work on serverless platforms. Legacy `.doc`
 * cannot be parsed without LibreOffice and is rejected with a clear message.
 */
export async function convertOfficeUploadToPdf(
  buffer: Buffer,
  originalFileName: string,
): Promise<OfficeConversionResult> {
  const lower = originalFileName.trim().toLowerCase();
  const isDocx = lower.endsWith(".docx");

  const tryLibreOffice = (): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const libre = loadLibreOfficeConvert();
      if (!libre) {
        reject(new Error("Could not find soffice binary (libreoffice-convert unavailable)."));
        return;
      }
      const fileName = officeTempFileName(originalFileName);
      const extraPath = process.env.LIBRE_OFFICE_EXE?.trim();
      const sofficeBinaryPaths = extraPath ? [extraPath] : undefined;
      libre.convertWithOptions(
        buffer,
        "pdf",
        undefined,
        { fileName, sofficeBinaryPaths },
        (err: NodeJS.ErrnoException | null, data: Buffer) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(data);
        },
      );
    });

  if (libreOfficeAvailable()) {
    try {
      const pdf = await tryLibreOffice();
      return { pdf, method: "libreoffice" };
    } catch (err) {
      if (!isMissingSofficeError(err) && !isDocx) {
        throw new Error(
          `Could not convert Word document to PDF: ${(err as Error).message}`,
        );
      }
      // Fall through to text fallback below.
    }
  }

  if (!isDocx) {
    throw new Error(
      "Legacy Word .doc files need a server with LibreOffice installed. Please save the document as .docx (or as a PDF) and upload again.",
    );
  }

  try {
    const pdf = await convertDocxToPdfViaTextFallback(buffer);
    return { pdf, method: "text-fallback" };
  } catch (fallbackErr) {
    throw new Error(
      `Could not convert this .docx to PDF (${(fallbackErr as Error).message}). ` +
        "Please save it as a PDF from Word and try again.",
    );
  }
}
