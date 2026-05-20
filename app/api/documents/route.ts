import { prisma } from "@/db/prisma";
import { getSignedDocumentUrl, uploadPdfToCloudinary } from "@/lib/cloudinary/upload";
import {
  convertOfficeUploadToPdf,
  pdfDisplayNameFromUpload,
  uploadedNameIsOfficeFormat,
} from "@/lib/documents/convert-office-to-pdf";
import { countPdfPages } from "@/lib/documents/pdf-page-count";
import { getRequestUser } from "@/lib/auth/request-user";
import { documentScopeWhere } from "@/lib/auth/scope";
import { getRequestMeta } from "@/lib/utils/request-meta";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Expected multipart/form-data with file" }, { status: 400 });
    }

    const lower = file.name.toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isWord = uploadedNameIsOfficeFormat(file.name);
    if (!isPdf && !isWord) {
      return NextResponse.json(
        { error: "Only PDF or Word documents (.docx, .doc) are supported" },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);
    let storedFileName = file.name;
    let conversionMethod: string | null = isPdf ? "pdf" : null;
    if (isWord) {
      const converted = await convertOfficeUploadToPdf(buffer, file.name);
      buffer = Buffer.from(converted.pdf);
      conversionMethod = converted.method;
      storedFileName = pdfDisplayNameFromUpload(file.name);
    }

    const pageCount = await countPdfPages(buffer);
    const cloudinary = await uploadPdfToCloudinary(buffer, storedFileName);

    const document = await prisma.document.create({
      data: {
        fileName: storedFileName,
        fileUrl: cloudinary.secureUrl,
        cloudinaryId: cloudinary.publicId,
        pageCount,
        conversionMethod,
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
        metadata: { uploadedAs: file.name, storedFileName, convertedFromWord: isWord },
      },
    });

    const conversionWarning =
      conversionMethod === "text-fallback"
        ? "Word was converted to a simplified multi-page text PDF. Page breaks may differ from Microsoft Word. For a faithful layout, upload the file as a PDF."
        : null;

    return NextResponse.json({ document, pageCount, conversionMethod, conversionWarning }, { status: 201 });
  } catch (error) {
    const message = (error as Error).message;
    const isWordConversionIssue =
      message.includes("LibreOffice") ||
      message.includes("soffice") ||
      message.includes("convert Word document") ||
      message.includes("libreoffice-convert") ||
      message.includes("Error calling soffice");
    return NextResponse.json({ error: message }, { status: isWordConversionIssue ? 422 : 500 });
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
