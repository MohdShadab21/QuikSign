import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolveSofficeBinaryPaths } from "@/lib/documents/libreoffice-paths";

const CONVERSION_TIMEOUT_MS = 120_000;

/** High-fidelity PDF export: embed fonts, preserve images/layout. */
const PDF_EXPORT_FILTER =
  'pdf:writer_pdf_Export:{"SelectPdfVersion":1,"UseTaggedPDF":false,"ExportFormFields":false,"EmbedStandardFonts":true,"Quality":100}';

function officeInputFileName(originalFileName: string): string {
  const base = path.basename(originalFileName.trim()) || "document.docx";
  const safe = base.replace(/[^\w.\-() ]+/g, "_");
  const lower = safe.toLowerCase();
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
    return safe;
  }
  return `${safe}.docx`;
}

async function rmSafe(target: string) {
  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function headlessSofficeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // Linux/macOS: true headless VCL (avoids GUI/printer hooks).
  if (process.platform !== "win32") {
    env.SAL_USE_VCLPLUGIN = "svp";
  }
  env.SAL_DISABLE_OPENCL = "1";
  return env;
}

/** Faithful Word→PDF via headless LibreOffice (layout, fonts, spacing preserved as LO allows). */
export async function convertOfficeBufferToPdfDirect(
  buffer: Buffer,
  originalFileName: string,
): Promise<Buffer> {
  const sofficePath = resolveSofficeBinaryPaths()[0];
  if (!sofficePath) {
    throw new Error("LibreOffice (soffice) not found. Set LIBRE_OFFICE_EXE in .env.");
  }

  const workDir = path.join(os.tmpdir(), `quiksign-lo-${randomUUID()}`);
  const profileDir = path.join(workDir, "profile");
  const inputDir = path.join(workDir, "input");
  const outputDir = path.join(workDir, "output");
  const inputName = officeInputFileName(originalFileName);
  const inputFile = path.join(inputDir, inputName);

  await fs.mkdir(profileDir, { recursive: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(inputFile, buffer);

  const userInstallation = pathToFileURL(profileDir).href;

  const runConvert = (convertTo: string) =>
    new Promise<void>((resolve, reject) => {
      const convertArgs = [
        `-env:UserInstallation=${userInstallation}`,
        "--headless",
        "--invisible",
        "--nologo",
        "--nofirststartwizard",
        "--norestore",
        "--nodefault",
        "--nolockcheck",
        "--nocrashreport",
        "--convert-to",
        convertTo,
        "--outdir",
        outputDir,
        inputFile,
      ];
      execFile(
        sofficePath,
        convertArgs,
        {
          timeout: CONVERSION_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
          env: headlessSofficeEnv(),
        },
        (error, _stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          const errText = (stderr ?? "").toString();
          if (/error|failed/i.test(errText) && !/convert/i.test(errText)) {
            reject(new Error(`LibreOffice: ${errText.slice(0, 400)}`));
            return;
          }
          resolve();
        },
      );
    });

  try {
    try {
      await runConvert(PDF_EXPORT_FILTER);
    } catch {
      await runConvert("pdf");
    }

    const stem = inputName.replace(/\.(docx?|DOCX?)$/i, "");
    let pdfPath = path.join(outputDir, `${stem}.pdf`);
    try {
      await fs.access(pdfPath);
    } catch {
      const entries = await fs.readdir(outputDir);
      const pdfName = entries.find((name) => name.toLowerCase().endsWith(".pdf"));
      if (!pdfName) {
        throw new Error("LibreOffice did not produce a PDF file.");
      }
      pdfPath = path.join(outputDir, pdfName);
    }

    const pdf = await fs.readFile(pdfPath);
    if (pdf.length < 100) {
      throw new Error("LibreOffice produced an empty PDF.");
    }
    return pdf;
  } finally {
    await rmSafe(workDir);
  }
}
