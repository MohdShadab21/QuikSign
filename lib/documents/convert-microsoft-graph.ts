/**
 * Word→PDF using Microsoft 365 / Graph — same engine as Word Online.
 * No desktop Word or LibreOffice on your PC required.
 */

let cachedDriveId: string | null = null;

export function microsoftGraphConversionConfigured(): boolean {
  const hasCreds = Boolean(
    process.env.MS_GRAPH_TENANT_ID?.trim()
    && process.env.MS_GRAPH_CLIENT_ID?.trim()
    && process.env.MS_GRAPH_CLIENT_SECRET?.trim(),
  );
  const hasDrive = Boolean(process.env.MS_GRAPH_DRIVE_ID?.trim());
  const hasSite = Boolean(
    process.env.MS_GRAPH_SITE_HOST?.trim() && process.env.MS_GRAPH_SITE_PATH?.trim(),
  );
  return hasCreds && (hasDrive || hasSite);
}

async function getGraphAccessToken(): Promise<string> {
  const tenant = process.env.MS_GRAPH_TENANT_ID!.trim();
  const clientId = process.env.MS_GRAPH_CLIENT_ID!.trim();
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET!.trim();

  const response = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  const data = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? "Microsoft Graph authentication failed.");
  }
  return data.access_token;
}

async function resolveGraphDriveId(token: string): Promise<string> {
  const explicit = process.env.MS_GRAPH_DRIVE_ID?.trim();
  if (explicit) {
    return explicit;
  }

  if (cachedDriveId) {
    return cachedDriveId;
  }

  const host = process.env.MS_GRAPH_SITE_HOST!.trim();
  const sitePath = process.env.MS_GRAPH_SITE_PATH!.trim().replace(/\/$/, "");
  const siteUrl = `https://graph.microsoft.com/v1.0/sites/${host}:${sitePath}:/drive`;
  const res = await fetch(siteUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });

  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new Error(
      data.error?.message
        ?? `Could not resolve SharePoint drive for ${host}${sitePath}. Check MS_GRAPH_SITE_HOST and MS_GRAPH_SITE_PATH.`,
    );
  }

  cachedDriveId = data.id;
  return data.id;
}

function graphContentType(fileName: string): string {
  return fileName.toLowerCase().endsWith(".doc")
    ? "application/msword"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export async function convertOfficeBufferToPdfViaMicrosoftGraph(
  buffer: Buffer,
  originalFileName: string,
): Promise<Buffer> {
  if (!microsoftGraphConversionConfigured()) {
    throw new Error("Microsoft Graph conversion is not configured.");
  }

  const token = await getGraphAccessToken();
  const driveId = await resolveGraphDriveId(token);
  const safeName = originalFileName.replace(/[^\w.\-() ]+/g, "_") || "document.docx";
  const itemPath = `quiksign-convert/${Date.now()}-${safeName}`;
  const encodedPath = itemPath.split("/").map(encodeURIComponent).join("/");

  const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodedPath}:/content`;
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": graphContentType(safeName),
    },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(90_000),
  });

  if (!uploadRes.ok) {
    const detail = (await uploadRes.text()).slice(0, 500);
    throw new Error(`Microsoft Graph upload failed (${uploadRes.status}): ${detail}`);
  }

  const item = (await uploadRes.json()) as { id?: string };
  if (!item.id) {
    throw new Error("Microsoft Graph upload did not return an item id.");
  }

  try {
    const pdfUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}/content?format=pdf`;
    const pdfRes = await fetch(pdfUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(90_000),
    });

    if (!pdfRes.ok) {
      const detail = (await pdfRes.text()).slice(0, 500);
      throw new Error(`Microsoft Graph PDF export failed (${pdfRes.status}): ${detail}`);
    }

    const pdf = Buffer.from(await pdfRes.arrayBuffer());
    if (pdf.length < 100) {
      throw new Error("Microsoft Graph returned an empty PDF.");
    }
    return pdf;
  } finally {
    await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
}
