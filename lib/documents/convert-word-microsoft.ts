import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isMicrosoftWordInstalled } from "@/lib/documents/detect-microsoft-word";

const CONVERSION_TIMEOUT_MS = 120_000;

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

function psQuote(filePath: string): string {
  return filePath.replace(/'/g, "''");
}

/** Use installed Microsoft Word on Windows (same output as File → Save As PDF). */
export function microsoftWordConversionEnabled(): boolean {
  return isMicrosoftWordInstalled();
}

/**
 * Word → PDF via ExportAsFixedFormat2 (native PDF export — not printing).
 * Preserves logos, highlights, headers, and fonts from your .docx.
 */
export async function convertOfficeBufferToPdfViaMicrosoftWord(
  buffer: Buffer,
  originalFileName: string,
): Promise<Buffer> {
  if (!microsoftWordConversionEnabled()) {
    throw new Error(
      "Microsoft Word is not installed. Install Word, or set LIBRE_OFFICE_EXE for LibreOffice conversion.",
    );
  }

  const workDir = path.join(os.tmpdir(), `quiksign-word-${randomUUID()}`);
  const inputName = officeInputFileName(originalFileName);
  const inputFile = path.join(workDir, inputName);
  const outputFile = path.join(workDir, `${inputName.replace(/\.(docx?|DOCX?)$/i, "")}.pdf`);

  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(inputFile, buffer);

  const script = `
$ErrorActionPreference = 'Stop'
$InputPath = '${psQuote(inputFile)}'
$OutputPath = '${psQuote(outputFile)}'
$word = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.ScreenUpdating = $false
  $doc = $word.Documents.Open($InputPath, $false, $true, $false)
  # wdExportFormatPDF = 17 — direct PDF export (not printing)
  try {
    $null = $doc.ExportAsFixedFormat2($OutputPath, 17, $false, 0, $false, $true, $true, 1, 0, $true, $true, $true, $false)
  } catch {
    $doc.SaveAs2([ref]$OutputPath, [ref]17)
  }
  $doc.Close([ref]0)
} finally {
  if ($word -ne $null) {
    $word.Quit([ref]0)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`.trim();

  const scriptPath = path.join(workDir, "convert.ps1");
  await fs.writeFile(scriptPath, script, "utf8");

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
        {
          timeout: CONVERSION_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            const detail = [stderr, stdout].filter(Boolean).join("\n").trim();
            reject(
              new Error(
                detail.length > 0
                  ? `Microsoft Word PDF export failed: ${detail.slice(0, 500)}`
                  : `Microsoft Word PDF export failed: ${(error as Error).message}`,
              ),
            );
            return;
          }
          resolve();
        },
      );
    });

    const pdf = await fs.readFile(outputFile);
    if (pdf.length < 100) {
      throw new Error("Microsoft Word produced an empty PDF.");
    }
    return pdf;
  } finally {
    await rmSafe(workDir);
  }
}
