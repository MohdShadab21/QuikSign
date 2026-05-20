import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { getSignedDocumentUrl } from "@/lib/cloudinary/upload";
import { isSignedCopyFileName, signedCopyFileName } from "@/lib/documents/signed-copy-name";
import { sendDocumentShareEmail } from "@/lib/email/smtp";

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser();
    const payload = (await request.json()) as { documentId?: string; toEmail?: string; signedOnly?: boolean };
    const documentId = payload.documentId?.trim() ?? "";
    const toEmail = payload.toEmail?.trim() ?? "";
    const signedOnly = Boolean(payload.signedOnly);
    if (!documentId || !toEmail) {
      return NextResponse.json({ error: "documentId and toEmail are required" }, { status: 400 });
    }

    const source = await prisma.document.findFirst({
      where: { id: documentId, orgId: user.orgId ?? undefined },
      select: { id: true, fileName: true, cloudinaryId: true },
    });
    if (!source) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    let document = source;
    if (signedOnly && !isSignedCopyFileName(source.fileName)) {
      const signedName = signedCopyFileName(source.fileName);
      const signedCopy = await prisma.document.findFirst({
        where: { orgId: user.orgId ?? undefined, fileName: signedName },
        orderBy: { createdAt: "desc" },
        select: { id: true, fileName: true, cloudinaryId: true },
      });
      if (!signedCopy) {
        return NextResponse.json(
          {
            error:
              "No signed copy found for this document. Sign and save it first, or uncheck “Share signed copy only”.",
          },
          { status: 400 },
        );
      }
      document = signedCopy;
    }

    const link = getSignedDocumentUrl(document.cloudinaryId);
    await sendDocumentShareEmail({
      toEmail,
      sharedByEmail: user.userEmail,
      documentTitle: document.fileName,
      documentLink: link,
    });

    return NextResponse.json({ ok: true, sharedFileName: document.fileName });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
