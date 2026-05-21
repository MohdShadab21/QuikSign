import { prisma } from "@/db/prisma";
import {
  getSignedDocumentUrl,
  uploadOfficeToCloudinary,
  uploadPdfToCloudinary,
} from "@/lib/cloudinary/upload";
import { getRequestUser } from "@/lib/auth/request-user";
import { documentScopeWhere } from "@/lib/auth/scope";
import { processDocumentUpload } from "@/lib/documents/process-document-upload";
import {
  isSupportedDocumentUpload,
  uploadRejectionMessage,
} from "@/lib/documents/pdf-upload-policy";
import { conversionQualityNote } from "@/lib/documents/conversion-quality-note";
import { getRequestMeta } from "@/lib/utils/request-meta";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Expected multipart/form-data with file" }, { status: 400 });
    }

    if (!isSupportedDocumentUpload(file.name, file.type)) {
      return NextResponse.json({ error: uploadRejectionMessage(file.name, file.type) }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let processed;
    try {
      processed = await processDocumentUpload(buffer, file.name);
    } catch (err) {
      const message = (err as Error).message;
      const status =
        message.includes("LibreOffice")
        || message.includes("Microsoft Word")
        || message.includes("convert Word")
        ? 503
        : 400;
      return NextResponse.json({ error: message }, { status });
    }

    const [cloudinary, originalCloudinary] = await Promise.all([
      uploadPdfToCloudinary(processed.signingPdfBuffer, processed.signingPdfFileName),
      processed.originalUploadBuffer && processed.originalFileName
        ? uploadOfficeToCloudinary(processed.originalUploadBuffer, processed.originalFileName)
        : Promise.resolve(null),
    ]);

    const document = await prisma.document.create({
      data: {
        fileName: processed.signingPdfFileName,
        fileUrl: cloudinary.secureUrl,
        cloudinaryId: cloudinary.publicId,
        originalCloudinaryId: originalCloudinary?.publicId,
        originalFileName: processed.originalFileName,
        pageCount: processed.pageCount,
        conversionMethod: processed.conversionMethod,
        uploadedById: user.userId,
        uploadedByEmail: user.userEmail,
        orgId: user.orgId,
      },
    });

    const meta = getRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        documentId: document.id,
        actorUserId: user.userId,
        actorEmail: user.userEmail,
        event: "document.created",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: {
          uploadedAs: file.name,
          signingPdf: processed.signingPdfFileName,
          conversionMethod: processed.conversionMethod,
          preservedOriginalWord: Boolean(originalCloudinary?.publicId),
        },
      },
    });

    const qualityNote = conversionQualityNote(processed.conversionMethod);

    return NextResponse.json(
      {
        document,
        pageCount: processed.pageCount,
        conversionMethod: processed.conversionMethod,
        conversionQualityNote: qualityNote,
        originalFileName: processed.originalFileName,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getRequestUser();
    const documents = await prisma.document.findMany({
      where: documentScopeWhere(user),
      orderBy: {
        createdAt: "desc",
      },
      include: {
        auditLogs: {
          where: { event: "SIGN_DOCUMENT_SAVED" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { metadata: true },
        },
      },
    });

    const hydrated = documents.map((document) => {
      const fields = (document.auditLogs[0]?.metadata as { fields?: unknown[] } | null)?.fields;
      return {
        ...document,
        signedDownloadUrl: getSignedDocumentUrl(document.cloudinaryId),
        hasPlacedFields: Array.isArray(fields) ? fields.length > 0 : false,
      };
    });

    return NextResponse.json({ documents: hydrated });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
