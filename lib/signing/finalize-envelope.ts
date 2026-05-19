import React from "react";
import crypto from "node:crypto";
import { Document, Page, Text, StyleSheet, pdf, type DocumentProps } from "@react-pdf/renderer";
import { PDFDocument, type PDFImage, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/db/prisma";
import {
  fetchCloudinaryFileBuffer,
  uploadRawPdfToCloudinary,
} from "@/lib/cloudinary/upload";

type FinalizationInput = {
  envelopeId: string;
};

function timestampLabel(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha256Hex(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function renderPdfToBuffer(input: React.ReactElement): Promise<Buffer> {
  const stream = await pdf(input as React.ReactElement<DocumentProps>).toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function createCompletionCertificatePdf(params: {
  envelopeTitle: string;
  documentName: string;
  completedAt: Date;
  sourceDocumentHash: string;
  signedDocumentHash: string;
  signers: { name: string; email: string; role: string; signedAt: Date | null }[];
}): Promise<Buffer> {
  const styles = StyleSheet.create({
    page: { padding: 34, fontSize: 11, color: "#0f172a" },
    title: { fontSize: 20, marginBottom: 12, fontWeight: 700 },
    subtitle: { marginBottom: 4 },
    section: { marginTop: 12, marginBottom: 6, fontSize: 13, fontWeight: 700 },
    row: { marginBottom: 4, fontSize: 10 },
    foot: { marginTop: 16, fontSize: 9, color: "#475569" },
  });

  const signerRows = params.signers.map((signer) =>
    React.createElement(
      Text,
      { key: `${signer.email}-${signer.role}`, style: styles.row },
      `${signer.role} - ${signer.name} <${signer.email}> - ${signer.signedAt ? signer.signedAt.toISOString() : "N/A"}`,
    ),
  );
  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.title }, "QuikSign Certificate of Completion"),
      React.createElement(Text, { style: styles.subtitle }, `Envelope: ${params.envelopeTitle}`),
      React.createElement(Text, { style: styles.subtitle }, `Document: ${params.documentName}`),
      React.createElement(Text, { style: styles.subtitle }, `Completed At: ${params.completedAt.toISOString()}`),
      React.createElement(Text, { style: styles.subtitle }, `Source SHA-256: ${params.sourceDocumentHash}`),
      React.createElement(Text, { style: styles.subtitle }, `Signed SHA-256: ${params.signedDocumentHash}`),
      React.createElement(Text, { style: styles.section }, "Recipient Summary"),
      ...signerRows,
      React.createElement(
        Text,
        { style: styles.foot },
        "This certificate confirms completion of workflow events captured in QuikSign audit logs.",
      ),
    ),
  );

  return renderPdfToBuffer(doc);
}

function truncateForPdfText(value: string, maxLength = 240): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function isLikelyImageDataUrl(value: string): boolean {
  const t = value.trim().toLowerCase();
  return t.startsWith("data:image/png") || t.startsWith("data:image/jpeg") || t.startsWith("data:image/jpg");
}

function isLikelyImageHttpUrl(value: string): boolean {
  const t = value.trim().toLowerCase();
  return t.startsWith("http://") || t.startsWith("https://");
}

async function embedImageFromString(pdf: PDFDocument, value: string): Promise<PDFImage | null> {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (isLikelyImageDataUrl(trimmed)) {
    const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(trimmed.replace(/\s/g, ""));
    if (!match?.[2]) {
      return null;
    }
    try {
      const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
      const kind = match[1].toLowerCase();
      if (kind === "png") {
        return await pdf.embedPng(bytes);
      }
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }

  if (isLikelyImageHttpUrl(trimmed)) {
    try {
      const response = await fetch(trimmed);
      if (!response.ok) {
        return null;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("png") || trimmed.toLowerCase().endsWith(".png")) {
        return await pdf.embedPng(bytes);
      }
      if (contentType.includes("jpeg") || contentType.includes("jpg") || /\.jpe?g($|\?)/i.test(trimmed)) {
        return await pdf.embedJpg(bytes);
      }
      // Best-effort: try PNG then JPG
      try {
        return await pdf.embedPng(bytes);
      } catch {
        return await pdf.embedJpg(bytes);
      }
    } catch {
      return null;
    }
  }

  return null;
}

function drawImageInFieldBox(
  page: ReturnType<PDFDocument["getPage"]>,
  image: PDFImage,
  box: { x: number; y: number; width: number; height: number },
  padding = 3,
): void {
  const innerW = Math.max(1, box.width - padding * 2);
  const innerH = Math.max(1, box.height - padding * 2);
  const iw = image.width;
  const ih = image.height;
  const scale = Math.min(innerW / iw, innerH / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = box.x + (box.width - dw) / 2;
  const dy = box.y + (box.height - dh) / 2;
  page.drawImage(image, { x: dx, y: dy, width: dw, height: dh });
}

export async function createSignedDocumentPdf(params: {
  sourcePdf: Buffer;
  envelopeTitle: string;
  completedAt: Date;
  signers: {
    id: string;
    name: string;
    email: string;
    role: string;
    signedAt: Date | null;
    signatureValue: string | null;
    sealValue: string | null;
  }[];
  fields: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    type: string;
    signerId: string;
    prefillValue: string | null;
    prefilledBySender: boolean;
    assignedRole: string;
  }[];
}): Promise<Buffer> {
  const pdf = await PDFDocument.load(params.sourcePdf);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const signatureFont = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const normalizePercent = (value: number): number => {
    const normalized = value > 100 ? value / 10 : value;
    return Math.max(0, Math.min(100, normalized));
  };

  for (const field of params.fields) {
    const pageIndex = field.page - 1;
    if (pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
      continue;
    }

    const signer = params.signers.find((entry) => entry.id === field.signerId);
    if (!signer) {
      continue;
    }

    const page = pdf.getPage(pageIndex);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const x = (normalizePercent(field.x) / 100) * pageWidth;
    const yTop = (normalizePercent(field.y) / 100) * pageHeight;
    const width = (normalizePercent(field.width) / 100) * pageWidth;
    const height = (normalizePercent(field.height) / 100) * pageHeight;
    const y = Math.max(0, pageHeight - yTop - height);

    // Pre-filled-by-sender fields are considered "filled" even without a signer signedAt,
    // because the sender already supplied the value before sending the envelope.
    const fieldHasPrefill = Boolean((field.prefillValue ?? "").trim());
    const prefilledLocked = Boolean(field.prefilledBySender) && fieldHasPrefill;
    const signed = Boolean(signer.signedAt) || prefilledLocked;

    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: signed ? rgb(0.92, 0.97, 1) : rgb(0.98, 0.98, 0.99),
      borderColor: signed ? rgb(0.12, 0.34, 0.65) : rgb(0.45, 0.49, 0.56),
      borderWidth: 1,
      opacity: signed ? 0.88 : 0.55,
    });

    const [firstName = signer.name, ...restNames] = signer.name.trim().split(/\s+/);
    const lastName = restNames.join(" ").trim() || signer.name;

    if (signed) {
      const box = { x, y, width, height };
      const fieldValue = (field.prefillValue ?? "").trim();

      if (field.type === "SEAL") {
        const sealRaw = fieldValue || signer.sealValue?.trim() || "";
        const sealImage = await embedImageFromString(pdf, sealRaw);
        if (sealImage) {
          drawImageInFieldBox(page, sealImage, box);
        } else if (sealRaw) {
          page.drawText(truncateForPdfText(sealRaw), {
            x: x + 4,
            y: y + height - 12,
            size: Math.min(11, Math.max(8, height / 2.5)),
            font: bold,
            color: rgb(0.09, 0.2, 0.38),
          });
        }
      } else if (field.type === "SIGNATURE" || field.type === "INITIAL") {
        const sigRaw = fieldValue || (signer.signatureValue?.trim() ?? "");
        const sigImage = await embedImageFromString(pdf, sigRaw);
        if (sigImage) {
          drawImageInFieldBox(page, sigImage, box);
        } else if (field.type === "INITIAL") {
          const initialsFromName = signer.name
            .split(/\s+/)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("")
            .slice(0, 4);
          const textLabel =
            sigRaw.length > 0 && !isLikelyImageDataUrl(sigRaw) && !isLikelyImageHttpUrl(sigRaw)
              ? truncateForPdfText(sigRaw, 48)
              : initialsFromName || signer.name;
          page.drawText(textLabel, {
            x: x + 4,
            y: y + height - 12,
            size: Math.min(11, Math.max(8, height / 2.5)),
            font: signatureFont,
            color: rgb(0.09, 0.2, 0.38),
          });
        } else {
          page.drawText(truncateForPdfText(sigRaw || signer.name), {
            x: x + 4,
            y: y + height - 12,
            size: Math.min(11, Math.max(8, height / 2.5)),
            font: signatureFont,
            color: rgb(0.09, 0.2, 0.38),
          });
        }
      } else if (field.type === "CHECKBOX") {
        const isTrue = ["true", "1", "yes", "y", "x", "on", "checked"].includes(fieldValue.toLowerCase());
        if (isTrue) {
          const checkSize = Math.min(width, height) * 0.7;
          const cx = x + (width - checkSize) / 2;
          const cy = y + (height - checkSize) / 2;
          page.drawText("X", {
            x: cx + checkSize * 0.15,
            y: cy + checkSize * 0.15,
            size: checkSize * 0.85,
            font: bold,
            color: rgb(0.09, 0.2, 0.38),
          });
        }
      } else {
        const dateBasis = signer.signedAt ?? params.completedAt;
        const fallback =
          field.type === "DATE"
            ? dateBasis.toISOString().slice(0, 10)
            : field.type === "NAME"
              ? signer.name
              : field.type === "FIRST_NAME"
                ? firstName
                : field.type === "LAST_NAME"
                  ? lastName
                  : field.type === "EMAIL_ADDRESS"
                    ? signer.email
                    : "";
        const label = fieldValue || fallback;
        if (label) {
          page.drawText(truncateForPdfText(label), {
            x: x + 4,
            y: y + height - 12,
            size: Math.min(11, Math.max(8, height / 2.5)),
            font: bold,
            color: rgb(0.09, 0.2, 0.38),
          });
        }
      }

      page.drawText(`${signer.role}`, {
        x: x + 4,
        y: y + 4,
        size: 7,
        font,
        color: rgb(0.25, 0.35, 0.48),
      });
      continue;
    }

    // Unsigned field placeholder (still shows placement in the final PDF)
    const placeholder = field.type === "SEAL" ? "STAMP" : field.type;
    page.drawText(placeholder, {
      x: x + 4,
      y: y + height - 12,
      size: Math.min(10, Math.max(7, height / 3)),
      font: bold,
      color: rgb(0.35, 0.4, 0.48),
      opacity: 0.8,
    });
    page.drawText(`${signer.role}`, {
      x: x + 4,
      y: y + 4,
      size: 7,
      font,
      color: rgb(0.35, 0.4, 0.48),
      opacity: 0.85,
    });
    page.drawText("Pending", {
      x: x + Math.max(4, width - 54),
      y: y + 4,
      size: 7,
      font,
      color: rgb(0.35, 0.4, 0.48),
      opacity: 0.85,
    });
  }

  const lastPage = pdf.getPage(pdf.getPageCount() - 1);
  const blockWidth = Math.min(520, lastPage.getWidth() - 64);
  const blockX = 32;
  const blockY = 24;
  const blockHeight = 94;

  lastPage.drawRectangle({
    x: blockX,
    y: blockY,
    width: blockWidth,
    height: blockHeight,
    color: rgb(0.95, 0.98, 1),
    borderColor: rgb(0.18, 0.31, 0.5),
    borderWidth: 1,
  });
  lastPage.drawText("QuikSign Completion Block", {
    x: blockX + 8,
    y: blockY + blockHeight - 16,
    size: 11,
    font: bold,
    color: rgb(0.1, 0.2, 0.38),
  });
  lastPage.drawText(`Envelope: ${params.envelopeTitle}`, {
    x: blockX + 8,
    y: blockY + blockHeight - 31,
    size: 8,
    font,
  });
  lastPage.drawText(`Completed At: ${params.completedAt.toISOString()}`, {
    x: blockX + 8,
    y: blockY + blockHeight - 43,
    size: 8,
    font,
  });
  const signerLine = params.signers
    .filter((signer) => signer.signedAt)
    .map((signer) => `${signer.role}:${signer.name}`)
    .join(" | ");
  lastPage.drawText(`Executed by: ${signerLine.slice(0, 220)}`, {
    x: blockX + 8,
    y: blockY + blockHeight - 57,
    size: 7,
    font,
  });

  return Buffer.from(await pdf.save());
}

/**
 * Build an on-demand signed PDF buffer reflecting all fields/signers in their CURRENT state.
 * Used so each signer can download a copy showing their signature (and any prior signatures)
 * even before the workflow is fully COMPLETED. No Cloudinary upload happens here.
 */
export async function buildSignedSnapshotPdfBuffer(envelopeId: string): Promise<Buffer | null> {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    include: {
      document: true,
      signers: { orderBy: { signingOrder: "asc" } },
      signatureFields: true,
    },
  });

  if (!envelope || !envelope.document?.cloudinaryId) {
    return null;
  }

  const sourcePdf = await fetchCloudinaryFileBuffer(envelope.document.cloudinaryId);
  return createSignedDocumentPdf({
    sourcePdf,
    envelopeTitle: envelope.title,
    completedAt: envelope.completedAt ?? new Date(),
    signers: envelope.signers.map((signer) => ({
      id: signer.id,
      name: signer.name,
      email: signer.email,
      role: signer.role,
      signedAt: signer.signedAt,
      signatureValue: signer.signatureValue,
      sealValue: signer.sealValue,
    })),
    fields: envelope.signatureFields.map((field) => ({
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      type: field.type,
      signerId: field.signerId,
      prefillValue: field.prefillValue,
      prefilledBySender: field.prefilledBySender,
      assignedRole: field.assignedRole,
    })),
  });
}

export async function finalizeEnvelopeArtifacts(input: FinalizationInput): Promise<void> {
  const envelope = await prisma.envelope.findUnique({
    where: { id: input.envelopeId },
    include: {
      document: true,
      signers: {
        orderBy: { signingOrder: "asc" },
      },
      signatureFields: true,
    },
  });

  if (!envelope || !envelope.completedAt || !envelope.document?.cloudinaryId) {
    return;
  }

  if (envelope.signedCloudinaryId && envelope.completionCertificateCloudinaryId) {
    return;
  }

  const sourcePdf = await fetchCloudinaryFileBuffer(envelope.document.cloudinaryId);
  const sourceDocumentHash = sha256Hex(sourcePdf);
  const signedPdf = await createSignedDocumentPdf({
    sourcePdf,
    envelopeTitle: envelope.title,
    completedAt: envelope.completedAt,
    signers: envelope.signers.map((signer) => ({
      id: signer.id,
      name: signer.name,
      email: signer.email,
      role: signer.role,
      signedAt: signer.signedAt,
      signatureValue: signer.signatureValue,
      sealValue: signer.sealValue,
    })),
    fields: envelope.signatureFields.map((field) => ({
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      type: field.type,
      signerId: field.signerId,
      prefillValue: field.prefillValue,
      prefilledBySender: field.prefilledBySender,
      assignedRole: field.assignedRole,
    })),
  });
  const signedDocumentHash = sha256Hex(signedPdf);

  const certificatePdf = await createCompletionCertificatePdf({
    envelopeTitle: envelope.title,
    documentName: envelope.document.fileName,
    completedAt: envelope.completedAt,
    sourceDocumentHash,
    signedDocumentHash,
    signers: envelope.signers.map((signer) => ({
      name: signer.name,
      email: signer.email,
      role: signer.role,
      signedAt: signer.signedAt,
    })),
  });

  const stamp = timestampLabel();
  const signedUpload = await uploadRawPdfToCloudinary(
    signedPdf,
    `${envelope.title}-${stamp}-signed.pdf`,
    "quiksign/completed",
  );
  const certificateUpload = await uploadRawPdfToCloudinary(
    certificatePdf,
    `${envelope.title}-${stamp}-certificate.pdf`,
    "quiksign/certificates",
  );

  await prisma.envelope.update({
    where: { id: envelope.id },
    data: {
      signedDocumentUrl: signedUpload.secureUrl,
      signedCloudinaryId: signedUpload.publicId,
      completionCertificateUrl: certificateUpload.secureUrl,
      completionCertificateCloudinaryId: certificateUpload.publicId,
    },
  });
}
