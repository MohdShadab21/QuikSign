import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { getSignedDocumentUrl } from "@/lib/cloudinary/upload";
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

    const document = await prisma.document.findFirst({
      where: { id: documentId, orgId: user.orgId ?? undefined },
      select: { id: true, fileName: true, cloudinaryId: true },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (signedOnly && !/-signed\.pdf$/i.test(document.fileName)) {
      return NextResponse.json(
        { error: "Please select a signed copy document or uncheck 'signed copy only'." },
        { status: 400 },
      );
    }

    const link = getSignedDocumentUrl(document.cloudinaryId);
    await sendDocumentShareEmail({
      toEmail,
      sharedByEmail: user.userEmail,
      documentTitle: document.fileName,
      documentLink: link,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

