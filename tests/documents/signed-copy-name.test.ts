import { describe, expect, it } from "vitest";
import { isSignedCopyFileName, signedCopyFileName } from "@/lib/documents/signed-copy-name";

describe("signedCopyFileName", () => {
  it("derives -signed.pdf from a PDF name", () => {
    expect(signedCopyFileName("contract.pdf")).toBe("contract-signed.pdf");
  });

  it("leaves an existing signed copy name unchanged", () => {
    expect(signedCopyFileName("contract-signed.pdf")).toBe("contract-signed.pdf");
  });

  it("detects signed copies", () => {
    expect(isSignedCopyFileName("contract-signed.pdf")).toBe(true);
    expect(isSignedCopyFileName("contract.pdf")).toBe(false);
  });
});
