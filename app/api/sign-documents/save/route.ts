import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { documentScopeWhere } from "@/lib/auth/scope";
import { fetchCloudinaryFileBuffer, uploadRawPdfToCloudinary, getSignedDocumentUrl } from "@/lib/cloudinary/upload";

export const runtime = "nodejs";
export const maxDuration = 60;

type FieldInput = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  label?: string;
  valueType?: "TEXT" | "DATE" | "CHECKBOX" | "SIGNATURE" | "STAMP";
  prefillValue?: string;
};

type SignDocumentSnapshot = {
  fields: FieldInput[];
  signerName: string;
  signerEmail: string;
  signatureValue: string;
  sealValue: string;
};

function normalizePercent(value: number): number {
  const normalized = value > 100 ? value / 10 : value;
  return Math.max(0, Math.min(100, normalized));
}

function signerInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
}

function parseDataImage(value: string): { mime: string; bytes: Buffer } | null {
  const match = value.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1]!, bytes: Buffer.from(match[2]!, "base64") };
}

function toPdfRect(field: FieldInput, pageWidth: number, pageHeight: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const percentX = normalizePercent(field.x);
  const percentY = normalizePercent(field.y);
  const percentWidth = normalizePercent(field.width);
  const percentHeight = normalizePercent(field.height);

  const width = Math.max(4, (percentWidth / 100) * pageWidth);
  const height = Math.max(4, (percentHeight / 100) * pageHeight);
  const x = (percentX / 100) * pageWidth;
  // UI uses top-left origin; PDF uses bottom-left origin.
  const y = Math.max(0, pageHeight - (percentY / 100) * pageHeight - height);

  return { x, y, width, height };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser();
    const payload = (await request.json()) as {
      documentId?: string;
      fields?: FieldInput[];
      signerName?: string;
      signerEmail?: string;
      signatureValue?: string;
      sealValue?: string;
    };
    const documentId = payload.documentId?.trim() ?? "";
    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, ...documentScopeWhere(user) },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const sourcePdf = await fetchCloudinaryFileBuffer(document.cloudinaryId);
    const pdf = await PDFDocument.load(sourcePdf);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const signatureFont = await pdf.embedFont(StandardFonts.TimesRomanItalic);

    const signerName = payload.signerName?.trim() || user.userEmail.split("@")[0] || "Signer";
    const signerEmail = payload.signerEmail?.trim() || user.userEmail;
    const signatureValue = payload.signatureValue?.trim() || signerName;
    const sealValue = payload.sealValue?.trim() || `STAMP: ${signerName}`;
    const fields = payload.fields ?? [];

    for (const field of fields) {
      const pageIndex = field.page - 1;
      if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) continue;
      const page = pdf.getPage(pageIndex);
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();
      const { x, y, width, height } = toPdfRect(field, pageWidth, pageHeight);

      const resolvedValueType =
        field.valueType
        ?? (field.type === "DATE"
          ? "DATE"
          : field.type === "CHECKBOX"
            ? "CHECKBOX"
            : field.type === "SEAL"
              ? "STAMP"
              : field.type === "SIGNATURE" || field.type === "INITIAL"
                ? "SIGNATURE"
                : "TEXT");
      const prefillValue = field.prefillValue?.trim() ?? "";
      const label =
        resolvedValueType === "DATE"
          ? (prefillValue || new Date().toISOString().slice(0, 10))
          : resolvedValueType === "STAMP"
            ? (prefillValue || sealValue)
            : resolvedValueType === "CHECKBOX"
              ? ((prefillValue || "true") === "true" ? "X" : "")
              : resolvedValueType === "SIGNATURE"
                ? (prefillValue || (field.type === "INITIAL" ? signerInitials(signerName) : signatureValue))
                : prefillValue || (
                  field.type === "NAME"
                    ? signerName
                    : field.type === "EMAIL_ADDRESS"
                      ? signerEmail
                      : signatureValue
                );
      const isSignatureLike = field.type === "SIGNATURE" || field.type === "INITIAL";
      const fontSize = Math.min(11, Math.max(7, height * 0.42));
      const textY = y + Math.max(2, (height - fontSize) / 2);
      const imagePayload = parseDataImage(label);
      if (imagePayload && (resolvedValueType === "SIGNATURE" || resolvedValueType === "STAMP")) {
        try {
          const embedded =
            imagePayload.mime.includes("png")
              ? await pdf.embedPng(imagePayload.bytes)
              : await pdf.embedJpg(imagePayload.bytes);
          page.drawImage(embedded, {
            x: x + 2,
            y: y + 2,
            width: Math.max(2, width - 4),
            height: Math.max(2, height - 4),
          });
        } catch {
          page.drawText("[image]", {
            x: x + 4,
            y: textY,
            size: fontSize,
            font: bold,
            color: rgb(0.09, 0.2, 0.38),
          });
        }
      } else {
        page.drawText(label, {
          x: x + 4,
          y: textY,
          size: fontSize,
          font: isSignatureLike ? signatureFont : bold,
          color: rgb(0.09, 0.2, 0.38),
        });
      }
    }

    const signedBuffer = Buffer.from(
      await pdf.save({
        useObjectStreams: false,
        addDefaultPage: false,
      }),
    );
    const signedName = document.fileName.toLowerCase().endsWith(".pdf")
      ? `${document.fileName.slice(0, -4)}-signed.pdf`
      : `${document.fileName}-signed.pdf`;
    const upload = await uploadRawPdfToCloudinary(signedBuffer, signedName, "quiksign/documents");
    const created = await prisma.document.create({
      data: {
        fileName: signedName,
        fileUrl: upload.secureUrl,
        cloudinaryId: upload.publicId,
        uploadedById: user.userId,
        uploadedByEmail: user.userEmail,
        orgId: user.orgId,
      },
    });
    const snapshot: SignDocumentSnapshot = {
      fields,
      signerName,
      signerEmail,
      signatureValue,
      sealValue,
    };
    await prisma.auditLog.create({
      data: {
        documentId: created.id,
        actorUserId: user.userId,
        actorEmail: user.userEmail,
        event: "SIGN_DOCUMENT_SAVED",
        metadata: snapshot,
      },
    });

    return NextResponse.json({
      documentId: created.id,
      downloadUrl: getSignedDocumentUrl(created.cloudinaryId),
      fileName: created.fileName,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

