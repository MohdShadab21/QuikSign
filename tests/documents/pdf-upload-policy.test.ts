import { describe, expect, it } from "vitest";
import {
  isPdfUpload,
  isSupportedDocumentUpload,
} from "@/lib/documents/pdf-upload-policy";

describe("document upload policy", () => {
  it("accepts .pdf extension", () => {
    expect(isPdfUpload("contract.pdf")).toBe(true);
    expect(isSupportedDocumentUpload("contract.pdf")).toBe(true);
  });

  it("accepts Word for supported upload", () => {
    expect(isPdfUpload("letter.docx")).toBe(false);
    expect(isSupportedDocumentUpload("letter.docx")).toBe(true);
    expect(isSupportedDocumentUpload("letter.doc")).toBe(true);
  });

  it("rejects unknown types", () => {
    expect(isSupportedDocumentUpload("notes.txt")).toBe(false);
  });
});
