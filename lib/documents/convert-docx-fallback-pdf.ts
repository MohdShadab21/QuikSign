import mammoth from "mammoth";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function wrapTextToLines(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\u00a0/g, " ");
  const paragraphs = normalized.split(/\n/);
  const lines: string[] = [];

  const pushWrappedParagraph = (para: string) => {
    const trimmed = para.trimEnd();
    if (trimmed.length === 0) {
      lines.push("");
      return;
    }
    const words = trimmed.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current.length > 0) {
        lines.push(current);
        current = "";
      }
      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
        current = word;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        const next = chunk + ch;
        if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
          chunk = next;
        } else {
          if (chunk.length > 0) {
            lines.push(chunk);
          }
          chunk = ch;
        }
      }
      current = chunk;
    }
    if (current.length > 0) {
      lines.push(current);
    }
  };

  for (const para of paragraphs) {
    pushWrappedParagraph(para);
  }

  if (lines.length === 0) {
    return ["(Empty document)"];
  }
  return lines;
}

/**
 * When LibreOffice is unavailable, build a simple multi-page PDF from .docx body text.
 * Layout differs from Word; signing and field placement still work on this PDF.
 */
export async function convertDocxToPdfViaTextFallback(buffer: Buffer): Promise<Buffer> {
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const text = rawText.trim().length > 0 ? rawText : "(No readable text in this document.)";

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const lineHeight = fontSize * 1.38;
  const margin = 48;
  const footerHeight = 22;
  const maxTextWidth = A4_WIDTH - 2 * margin;
  const lines = wrapTextToLines(text, maxTextWidth, font, fontSize);

  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - margin - fontSize;
  const minY = margin + footerHeight;

  const drawFooter = (p: PDFPage) => {
    p.drawText("QuikSign — text preview without LibreOffice (install LibreOffice for a faithful Word layout).", {
      x: margin,
      y: margin - 2,
      size: 7.5,
      font,
      color: rgb(0.42, 0.45, 0.5),
      maxWidth: maxTextWidth,
    });
  };

  for (const line of lines) {
    if (y < minY + lineHeight) {
      drawFooter(page);
      page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = A4_HEIGHT - margin - fontSize;
    }
    if (line.length > 0) {
      page.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.09, 0.11, 0.15),
      });
    }
    y -= lineHeight;
  }

  drawFooter(page);

  return Buffer.from(await pdfDoc.save());
}
