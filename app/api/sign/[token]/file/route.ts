import { prisma } from "@/db/prisma";
import { hashSigningToken } from "@/lib/utils/tokens";
import { fetchCloudinaryFileBuffer } from "@/lib/cloudinary/upload";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { EnvelopeStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = {
  params: Promise<{ token: string }>;
};

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 120);
}

/**
 * Stream the envelope's source PDF using a fresh Cloudinary signed URL for every request.
 * Avoids leaking the short-lived signed URL to the browser (react-pdf can't refresh it).
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const limit = checkRateLimit(request, "sign-file", 120, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many file requests. Please retry shortly." }, { status: 429 });
    }

    const { token } = await params;
    const tokenHash = hashSigningToken(token);

    const envelope = await prisma.envelope.findFirst({
      where: {
        signingTokenHash: tokenHash,
        tokenExpiresAt: { gte: new Date() },
      },
      include: { document: true },
    });

    if (!envelope || !envelope.document?.cloudinaryId) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }
    if (envelope.status === EnvelopeStatus.VOIDED || envelope.status === EnvelopeStatus.DECLINED) {
      return NextResponse.json({ error: `Envelope is not available (${envelope.status})` }, { status: 409 });
    }

    const pdfBuffer = await fetchCloudinaryFileBuffer(envelope.document.cloudinaryId);
    const fileName = `${safeName(envelope.title || envelope.document.fileName || "document")}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${fileName}"`,
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
