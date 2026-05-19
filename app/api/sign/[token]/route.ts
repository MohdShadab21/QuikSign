import { prisma } from "@/db/prisma";
import { hashSigningToken } from "@/lib/utils/tokens";
import { getRequestMeta } from "@/lib/utils/request-meta";
import { getSignedDocumentUrl } from "@/lib/cloudinary/upload";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { EnvelopeStatus, SignerRole, SignerStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  params: Promise<{ token: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const limit = checkRateLimit(request, "sign-session-get", 60, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many session requests. Please retry shortly." }, { status: 429 });
    }

    const { token } = await params;
    const tokenHash = hashSigningToken(token);

    const envelope = await prisma.envelope.findFirst({
      where: {
        signingTokenHash: tokenHash,
        tokenExpiresAt: { gte: new Date() },
      },
      include: {
        document: true,
        signers: {
          orderBy: { signingOrder: "asc" },
        },
        signatureFields: {
          include: {
            signer: { select: { email: true, name: true } },
          },
        },
      },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }
    if (
      envelope.status === EnvelopeStatus.VOIDED ||
      envelope.status === EnvelopeStatus.DECLINED ||
      envelope.status === EnvelopeStatus.EXPIRED ||
      envelope.status === EnvelopeStatus.COMPLETED
    ) {
      return NextResponse.json(
        {
          error: `Envelope is not available for signing (${envelope.status})`,
          status: envelope.status,
          signedDocumentAvailable: Boolean(envelope.signedCloudinaryId),
        },
        { status: 409 },
      );
    }

    const signer =
      envelope.signers.find(
        (current) =>
          (current.status === SignerStatus.PENDING || current.status === SignerStatus.VIEWED) &&
          current.role !== SignerRole.CC,
      ) ?? null;

    const meta = getRequestMeta(request);
    const justTransitionedToViewed =
      envelope.status === EnvelopeStatus.SENT && Boolean(signer) && signer!.status === SignerStatus.PENDING;
    if (justTransitionedToViewed) {
      await prisma.signer.update({
        where: { id: signer!.id },
        data: { status: SignerStatus.VIEWED, viewedAt: new Date() },
      });
      await prisma.auditLog.create({
        data: {
          envelopeId: envelope.id,
          documentId: envelope.documentId,
          actorEmail: signer!.email,
          event: "signer.viewed",
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });
    }
    const signersForResponse = justTransitionedToViewed
      ? await prisma.signer.findMany({
          where: { envelopeId: envelope.id },
          orderBy: { signingOrder: "asc" },
        })
      : envelope.signers;
    const activeSigner =
      signersForResponse.find(
        (current) =>
          (current.status === SignerStatus.PENDING || current.status === SignerStatus.VIEWED) &&
          current.role !== SignerRole.CC,
      ) ?? null;

    return NextResponse.json({
      envelope: {
        id: envelope.id,
        title: envelope.title,
        subject: envelope.subject,
        message: envelope.message,
        status: envelope.status,
        documentUrl: getSignedDocumentUrl(envelope.document.cloudinaryId),
        documentFileName: envelope.document.fileName,
        documentPageCount: envelope.document.pageCount ?? null,
        documentConversionMethod: envelope.document.conversionMethod ?? null,
        signedDocumentAvailable: Boolean(envelope.signedCloudinaryId),
        sentAt: envelope.sentAt ?? envelope.createdAt,
        expiresAt: envelope.tokenExpiresAt,
        senderEmail: envelope.createdByEmail,
        signers: signersForResponse,
        fields: envelope.signatureFields.map((field) => ({
          id: field.id,
          signerEmail: field.signer.email,
          signerName: field.signer.name,
          label: field.label,
          required: field.required,
          readOnly: field.readOnly,
          prefillValue: field.prefillValue,
          prefilledBySender: field.prefilledBySender,
          assignedRole: field.assignedRole,
          valueType: field.valueType,
          zIndex: field.zIndex,
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          type: field.type,
        })),
      },
      activeSigner,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
