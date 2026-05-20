import { describe, expect, it } from "vitest";
import {
  createEnvelopeSchema,
  createSigningPresetSchema,
  signatureFieldInputSchema,
} from "../../lib/validations/envelope";

describe("envelope validations", () => {
  it("rejects duplicate signer emails", () => {
    const parsed = createEnvelopeSchema.safeParse({
      title: "Offer Letter",
      expiresInDays: 7,
      documentId: "7b296ab2-593d-4338-8f4a-9825fd0a5cbe",
      signers: [
        { name: "A", email: "same@company.com", signingOrder: 1, role: "SIGNER" },
        { name: "B", email: "SAME@company.com", signingOrder: 2, role: "APPROVER" },
      ],
      fields: [
        {
          signerEmail: "same@company.com",
          page: 1,
          x: 10,
          y: 10,
          width: 20,
          height: 12,
          type: "SIGNATURE",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts SEAL as a signature field type", () => {
    const parsed = signatureFieldInputSchema.safeParse({
      signerEmail: "seal@company.com",
      page: 1,
      x: 12,
      y: 24,
      width: 20,
      height: 12,
      type: "SEAL",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects template placeholder signer emails", () => {
    const parsed = createEnvelopeSchema.safeParse({
      title: "Offer Letter",
      expiresInDays: 7,
      documentId: "7b296ab2-593d-4338-8f4a-9825fd0a5cbe",
      signers: [
        { name: "Primary", email: "primary.signer@template.local", signingOrder: 1, role: "SIGNER" },
      ],
      fields: [
        {
          signerEmail: "primary.signer@template.local",
          page: 1,
          x: 10,
          y: 10,
          width: 20,
          height: 12,
          type: "SIGNATURE",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("requires signature or seal value in preset payload", () => {
    const parsed = createSigningPresetSchema.safeParse({
      token: "1234567890-token",
      label: "Empty preset",
    });

    expect(parsed.success).toBe(false);
  });
});
