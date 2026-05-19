import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { getSignedDocumentUrl } from "@/lib/cloudinary/upload";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await getRequestUser();
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        orgId: user.orgId ?? undefined,
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({
      document: {
        ...document,
        signedDownloadUrl: getSignedDocumentUrl(document.cloudinaryId),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await getRequestUser();
    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        orgId: user.orgId ?? undefined,
      },
      select: { id: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await prisma.document.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
