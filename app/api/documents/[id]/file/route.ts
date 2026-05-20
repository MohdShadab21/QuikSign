import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { documentScopeWhere } from "@/lib/auth/scope";
import { fetchCloudinaryFileBuffer } from "@/lib/cloudinary/upload";
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
        ...documentScopeWhere(user),
      },
      select: { cloudinaryId: true, fileName: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const buffer = await fetchCloudinaryFileBuffer(document.cloudinaryId);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/pdf",
        // Avoid re-downloading the PDF on every re-render while staying safe for authenticated documents.
        "cache-control": "private, max-age=120, stale-while-revalidate=600",
        "content-disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

