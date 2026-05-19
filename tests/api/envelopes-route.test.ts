import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = {
  document: { findFirst: vi.fn() },
  auditLog: { createMany: vi.fn() },
  $transaction: vi.fn(),
};

const transactionMock = {
  envelope: { create: vi.fn() },
  signatureField: { createMany: vi.fn() },
};

vi.mock("@/db/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/request-user", () => ({
  getRequestUser: vi.fn(async () => ({
    userId: "user-1",
    userEmail: "owner@company.com",
    orgId: "org-1",
  })),
}));

vi.mock("@/lib/utils/tokens", () => ({
  createRawSigningToken: vi.fn(() => "raw-signing-token"),
  hashSigningToken: vi.fn(() => "hash-signing-token"),
}));

vi.mock("@/lib/utils/request-meta", () => ({
  getRequestMeta: vi.fn(() => ({
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  })),
}));

vi.mock("@/lib/email/smtp", () => ({
  sendSigningInviteEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/integrations/webhook", () => ({
  publishWebhook: vi.fn(async () => undefined),
}));

function buildPayload() {
  return {
    title: "Offer Letter",
    expiresInDays: 7,
    documentId: "7b296ab2-593d-4338-8f4a-9825fd0a5cbe",
    signers: [
      {
        name: "Primary",
        email: "primary@company.com",
        signingOrder: 1,
        role: "SIGNER",
      },
    ],
    fields: [
      {
        signerEmail: "primary@company.com",
        page: 1,
        x: 10,
        y: 20,
        width: 20,
        height: 12,
        type: "SEAL",
      },
    ],
  };
}

describe("/api/envelopes POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof transactionMock) => Promise<unknown>) =>
      callback(transactionMock),
    );
  });

  it("returns 400 for duplicate signer emails", async () => {
    const { POST } = await import("../../app/api/envelopes/route");
    const payload = buildPayload();
    payload.signers.push({
      name: "Duplicate",
      email: "PRIMARY@company.com",
      signingOrder: 2,
      role: "APPROVER",
    });
    const request = new NextRequest("http://localhost:3000/api/envelopes", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 404 when document does not exist", async () => {
    prismaMock.document.findFirst.mockResolvedValue(null);

    const { POST } = await import("../../app/api/envelopes/route");
    const request = new NextRequest("http://localhost:3000/api/envelopes", {
      method: "POST",
      body: JSON.stringify(buildPayload()),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("creates signature fields with field type", async () => {
    prismaMock.document.findFirst.mockResolvedValue({ id: "doc-1" });
    transactionMock.envelope.create.mockResolvedValue({
      id: "env-1",
      title: "Offer Letter",
      subject: null,
      message: null,
      documentId: "doc-1",
      orgId: "org-1",
      signers: [
        {
          id: "signer-1",
          name: "Primary",
          email: "primary@company.com",
          signingOrder: 1,
          role: "SIGNER",
        },
      ],
    });

    const { POST } = await import("../../app/api/envelopes/route");
    const request = new NextRequest("http://localhost:3000/api/envelopes", {
      method: "POST",
      body: JSON.stringify(buildPayload()),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(transactionMock.signatureField.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: "SEAL",
          }),
        ]),
      }),
    );
  });
});
