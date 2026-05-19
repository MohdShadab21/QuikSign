import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = {
  envelope: {
    findFirst: vi.fn(),
  },
  signingPreset: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock("@/db/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/utils/tokens", () => ({
  hashSigningToken: vi.fn(() => "token-hash"),
}));

function buildSessionEnvelope() {
  return {
    id: "env-1",
    orgId: "org-1",
    signers: [
      { id: "cc-1", email: "cc@company.com", name: "CC", role: "CC", status: "PENDING" },
      { id: "signer-1", email: "signer@company.com", name: "Signer", role: "SIGNER", status: "PENDING" },
    ],
  };
}

describe("sign presets route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<void>) => {
      await callback(prismaMock);
    });
  });

  it("GET returns presets for actionable signer (non-CC)", async () => {
    prismaMock.envelope.findFirst.mockResolvedValue(buildSessionEnvelope());
    prismaMock.signingPreset.findMany.mockResolvedValue([
      {
        id: "p1",
        label: "Default HR",
        isDefault: true,
        signatureValue: "HR Sign",
        sealValue: "HR Seal",
        updatedAt: new Date().toISOString(),
      },
    ]);

    const { GET } = await import("../../app/api/sign/presets/route");
    const request = new NextRequest("http://localhost:3000/api/sign/presets?token=abc123456789");
    const response = await GET(request);
    const body = (await response.json()) as { presets?: Array<{ label: string }> };

    expect(response.status).toBe(200);
    expect(prismaMock.signingPreset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerEmail: "signer@company.com" },
      }),
    );
    expect(body.presets?.[0]?.label).toBe("Default HR");
  });

  it("PUT sets one default preset and unsets others", async () => {
    prismaMock.envelope.findFirst.mockResolvedValue(buildSessionEnvelope());
    prismaMock.signingPreset.findUnique.mockResolvedValue({
      id: "preset-1",
      ownerEmail: "signer@company.com",
    });
    prismaMock.signingPreset.findMany.mockResolvedValue([
      {
        id: "preset-1",
        label: "Default HR",
        isDefault: true,
        signatureValue: "A",
        sealValue: "B",
        updatedAt: new Date().toISOString(),
      },
    ]);

    const { PUT } = await import("../../app/api/sign/presets/route");
    const request = new NextRequest("http://localhost:3000/api/sign/presets", {
      method: "PUT",
      body: JSON.stringify({
        token: "abc123456789",
        presetId: "6c5852d3-7f9f-4ee7-a7a8-1fcb76cd5fbe",
      }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(prismaMock.signingPreset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isDefault: false },
      }),
    );
    expect(prismaMock.signingPreset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isDefault: true },
      }),
    );
  });

  it("DELETE rejects preset not owned by signer", async () => {
    prismaMock.envelope.findFirst.mockResolvedValue(buildSessionEnvelope());
    prismaMock.signingPreset.findUnique.mockResolvedValue({
      id: "preset-1",
      ownerEmail: "other@company.com",
    });

    const { DELETE } = await import("../../app/api/sign/presets/route");
    const request = new NextRequest("http://localhost:3000/api/sign/presets", {
      method: "DELETE",
      body: JSON.stringify({
        token: "abc123456789",
        presetId: "6c5852d3-7f9f-4ee7-a7a8-1fcb76cd5fbe",
      }),
    });
    const response = await DELETE(request);

    expect(response.status).toBe(404);
    expect(prismaMock.signingPreset.delete).not.toHaveBeenCalled();
  });
});
