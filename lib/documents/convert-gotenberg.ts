/**
 * Word→PDF via Gotenberg (LibreOffice in Docker). Deploy once (Railway/Fly/Render), set GOTENBERG_URL in Vercel.
 * @see https://gotenberg.dev/docs/routes#convert-with-libreoffice
 */
export function gotenbergConversionConfigured(): boolean {
  return Boolean(process.env.GOTENBERG_URL?.trim());
}

export async function convertOfficeBufferToPdfViaGotenberg(
  buffer: Buffer,
  originalFileName: string,
): Promise<Buffer> {
  const baseUrl = process.env.GOTENBERG_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("GOTENBERG_URL is not configured.");
  }

  const lower = originalFileName.toLowerCase();
  const uploadName =
    lower.endsWith(".docx") || lower.endsWith(".doc")
      ? originalFileName
      : `${originalFileName}.docx`;

  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(buffer)]), uploadName);

  const response = await fetch(`${baseUrl}/forms/libreoffice/convert`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Gotenberg conversion failed (${response.status}): ${detail}`);
  }

  const pdf = Buffer.from(await response.arrayBuffer());
  if (pdf.length < 100) {
    throw new Error("Gotenberg returned an empty PDF.");
  }
  return pdf;
}
