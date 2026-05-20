import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { envelopeScopeWhere } from "@/lib/auth/scope";
import { getSignedDocumentUrl } from "@/lib/cloudinary/upload";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await getRequestUser();
    const { id } = await params;

    const envelope = await prisma.envelope.findFirst({
      where: {
        id,
        ...envelopeScopeWhere(user),
      },
      include: {
        document: true,
        signers: true,
        signatureFields: true,
        auditLogs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Envelope not found" }, { status: 404 });
    }

    return NextResponse.json({
      envelope: {
        ...envelope,
        signedDocumentDownloadUrl: envelope.signedCloudinaryId
          ? getSignedDocumentUrl(envelope.signedCloudinaryId)
          : null,
        completionCertificateDownloadUrl: envelope.completionCertificateCloudinaryId
          ? getSignedDocumentUrl(envelope.completionCertificateCloudinaryId)
          : null,
        completedPacketUrl:
          envelope.signedCloudinaryId && envelope.completionCertificateCloudinaryId
            ? `/api/envelopes/${envelope.id}/packet`
            : null,
        document: {
          ...envelope.document,
          signedDownloadUrl: getSignedDocumentUrl(envelope.document.cloudinaryId),
        },
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
