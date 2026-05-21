import { describe, expect, it } from "vitest";
import { signingFieldDisplayLabel } from "@/lib/signing/field-access";

describe("signingFieldDisplayLabel", () => {
  it("shows custom label from sender", () => {
    expect(
      signingFieldDisplayLabel(
        {
          label: "Authorized Signatory",
          signerEmail: "signer@company.com",
          assignedRole: "RECIPIENT",
        },
        "signer@company.com",
      ),
    ).toBe("Authorized Signatory");
  });

  it("does not show generic Your field when label is set", () => {
    const label = signingFieldDisplayLabel(
      {
        label: "Company Seal",
        signerEmail: "signer@company.com",
        type: "SEAL",
        assignedRole: "RECIPIENT",
      },
      "signer@company.com",
    );
    expect(label).not.toBe("Your field");
    expect(label).toBe("Company Seal");
  });
});
