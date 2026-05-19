import JSZip from "jszip";
import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { getSignedDocumentUrl, fetchCloudinaryBySignedUrl } from "@/lib/cloudinary/upload";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = {
  params: Promise<{ id: string }>;
};

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 120);
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await getRequestUser();
    const { id } = await params;

    const envelope = await prisma.envelope.findFirst({
      where: {
        id,
        orgId: user.orgId ?? undefined,
      },
      include: {
        document: true,
        signers: {
          orderBy: { signingOrder: "asc" },
        },
        auditLogs: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Envelope not found" }, { status: 404 });
    }
    if (!envelope.signedCloudinaryId || !envelope.completionCertificateCloudinaryId) {
      return NextResponse.json(
        { error: "Completion artifacts not available yet. Complete all recipients first." },
        { status: 409 },
      );
    }

    const signedPdfUrl = getSignedDocumentUrl(envelope.signedCloudinaryId);
    const certificateUrl = getSignedDocumentUrl(envelope.completionCertificateCloudinaryId);
    const [signedPdfBuffer, certificateBuffer] = await Promise.all([
      fetchCloudinaryBySignedUrl(signedPdfUrl),
      fetchCloudinaryBySignedUrl(certificateUrl),
    ]);

    const zip = new JSZip();
    const packetRoot = safeName(`${envelope.title}-${envelope.id}`);

    zip.file(`${packetRoot}/signed-document.pdf`, signedPdfBuffer);
    zip.file(`${packetRoot}/certificate-of-completion.pdf`, certificateBuffer);

    const auditPayload = {
      envelope: {
        id: envelope.id,
        title: envelope.title,
        status: envelope.status,
        createdByEmail: envelope.createdByEmail,
        createdAt: envelope.createdAt,
        completedAt: envelope.completedAt,
      },
      document: {
        id: envelope.document.id,
        fileName: envelope.document.fileName,
        cloudinaryId: envelope.document.cloudinaryId,
      },
      signers: envelope.signers.map((signer) => ({
        id: signer.id,
        name: signer.name,
        email: signer.email,
        role: signer.role,
        status: signer.status,
        signedAt: signer.signedAt,
        viewedAt: signer.viewedAt,
      })),
      auditLogs: envelope.auditLogs.map((log) => ({
        id: log.id,
        event: log.event,
        actorEmail: log.actorEmail,
        actorUserId: log.actorUserId,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
    };

    zip.file(`${packetRoot}/audit-log.json`, JSON.stringify(auditPayload, null, 2));
    zip.file(
      `${packetRoot}/README.txt`,
      [
        "QuikSign Completed Packet",
        "",
        `Envelope: ${envelope.title}`,
        `Envelope ID: ${envelope.id}`,
        `Generated At: ${new Date().toISOString()}`,
        "",
        "Contents:",
        "- signed-document.pdf",
        "- certificate-of-completion.pdf",
        "- audit-log.json",
      ].join("\n"),
    );

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const fileName = `${safeName(envelope.title)}-${envelope.id}-packet.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
