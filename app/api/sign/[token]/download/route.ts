import { prisma } from "@/db/prisma";
import { hashSigningToken } from "@/lib/utils/tokens";
import { getSignedDocumentUrl, fetchCloudinaryBySignedUrl } from "@/lib/cloudinary/upload";
import { buildSignedSnapshotPdfBuffer } from "@/lib/signing/finalize-envelope";
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

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { token } = await params;
    const tokenHash = hashSigningToken(token);

    const envelope = await prisma.envelope.findFirst({
      where: {
        signingTokenHash: tokenHash,
        tokenExpiresAt: { gte: new Date() },
      },
      select: {
        id: true,
        title: true,
        status: true,
        tokenExpiresAt: true,
        signedCloudinaryId: true,
        signers: { select: { id: true, signedAt: true } },
        signatureFields: {
          where: { prefilledBySender: true },
          select: { id: true, prefillValue: true },
        },
      },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    if (
      envelope.status === EnvelopeStatus.VOIDED ||
      envelope.status === EnvelopeStatus.DECLINED ||
      envelope.status === EnvelopeStatus.EXPIRED
    ) {
      return NextResponse.json(
        { error: `Download is not available (${envelope.status})` },
        { status: 409 },
      );
    }

    const fileName = `${safeName(envelope.title)}-${envelope.id}-signed.pdf`;

    // Prefer the finalized Cloudinary artifact when it exists (COMPLETED envelopes).
    if (envelope.signedCloudinaryId) {
      const signedPdfUrl = getSignedDocumentUrl(envelope.signedCloudinaryId);
      const signedPdfBuffer = await fetchCloudinaryBySignedUrl(signedPdfUrl);
      return new NextResponse(new Uint8Array(signedPdfBuffer), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    // Otherwise build a snapshot reflecting the current signed-so-far state. This requires at
    // least one signer to have signed (or a sender pre-fill) so the snapshot has something
    // to show. Otherwise fall back to a 409 with a clear message.
    const hasAnySignature =
      envelope.signers.some((signer) => signer.signedAt !== null) ||
      envelope.signatureFields.some((field) => (field.prefillValue ?? "").trim().length > 0);

    if (!hasAnySignature) {
      return NextResponse.json(
        { error: "No signatures have been applied yet. Please sign before downloading." },
        { status: 409 },
      );
    }

    const snapshot = await buildSignedSnapshotPdfBuffer(envelope.id);
    if (!snapshot) {
      return NextResponse.json({ error: "Unable to generate signed PDF snapshot." }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(snapshot), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

