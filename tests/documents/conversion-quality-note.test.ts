import { describe, expect, it } from "vitest";
import { conversionQualityNote } from "@/lib/documents/conversion-quality-note";

describe("conversionQualityNote", () => {
  it("warns for LibreOffice", () => {
    expect(conversionQualityNote("libreoffice")).toContain("LibreOffice");
  });

  it("is silent for Microsoft Graph", () => {
    expect(conversionQualityNote("microsoft-graph")).toBeNull();
  });
});
