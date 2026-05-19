import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = {
  envelope: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
};

const transactionMock = {
  signer: {
    update: vi.fn(),
    count: vi.fn(),
  },
  envelope: {
    update: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

vi.mock("@/db/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/utils/tokens", () => ({
  hashSigningToken: vi.fn(() => "hash-token"),
}));

vi.mock("@/lib/utils/request-meta", () => ({
  getRequestMeta: vi.fn(() => ({ ipAddress: "127.0.0.1", userAgent: "vitest" })),
}));

vi.mock("@/lib/email/smtp", () => ({
  sendSigningCompletedEmail: vi.fn(async () => undefined),
  sendSigningInviteEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/integrations/webhook", () => ({
  publishWebhook: vi.fn(async () => undefined),
}));

vi.mock("@/lib/signing/finalize-envelope", () => ({
  finalizeEnvelopeArtifacts: vi.fn(async () => undefined),
}));

describe("/api/sign POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof transactionMock) => Promise<void>) => {
      await callback(transactionMock);
    });
  });

  it("returns 409 when envelope is not SENT", async () => {
    prismaMock.envelope.findFirst.mockResolvedValue({
      id: "env-1",
      status: "COMPLETED",
      tokenExpiresAt: new Date(Date.now() + 100000),
      signers: [],
    });

    const { POST } = await import("../../app/api/sign/route");
    const request = new NextRequest("http://localhost:3000/api/sign", {
      method: "POST",
      body: JSON.stringify({
        token: "sign-token-12345",
        signatureType: "TYPE",
        signatureValue: "John Doe",
        consentAccepted: true,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
  });

  it("returns 409 when next recipient is approver", async () => {
    prismaMock.envelope.findFirst.mockResolvedValue({
      id: "env-1",
      status: "SENT",
      documentId: "doc-1",
      orgId: "org-1",
      tokenExpiresAt: new Date(Date.now() + 100000),
      signers: [
        {
          id: "approver-1",
          email: "approver@company.com",
          role: "APPROVER",
          status: "PENDING",
          signingOrder: 1,
        },
      ],
    });

    const { POST } = await import("../../app/api/sign/route");
    const request = new NextRequest("http://localhost:3000/api/sign", {
      method: "POST",
      body: JSON.stringify({
        token: "sign-token-12345",
        signatureType: "TYPE",
        signatureValue: "John Doe",
        consentAccepted: true,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
  });

  it("stores signature and seal values for signer", async () => {
    prismaMock.envelope.findFirst.mockResolvedValue({
      id: "env-1",
      status: "SENT",
      documentId: "doc-1",
      orgId: "org-1",
      tokenExpiresAt: new Date(Date.now() + 100000),
      signers: [
        {
          id: "signer-1",
          email: "signer@company.com",
          name: "Signer",
          role: "SIGNER",
          status: "PENDING",
          signingOrder: 1,
        },
      ],
    });
    transactionMock.signer.count.mockResolvedValue(1);
    prismaMock.envelope.findUnique.mockResolvedValue({
      id: "env-1",
      title: "Doc",
      subject: null,
      message: null,
      createdByEmail: "owner@company.com",
      orgId: "org-1",
      status: "SENT",
      signers: [
        {
          id: "signer-2",
          email: "next@company.com",
          name: "Next",
          role: "SIGNER",
          status: "PENDING",
          signingOrder: 2,
        },
      ],
    });

    const { POST } = await import("../../app/api/sign/route");
    const request = new NextRequest("http://localhost:3000/api/sign", {
      method: "POST",
      body: JSON.stringify({
        token: "sign-token-12345",
        signatureType: "TYPE",
        signatureValue: "John Doe",
        sealValue: "Official Seal",
        consentAccepted: true,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(transactionMock.signer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signatureValue: "John Doe",
          sealValue: "Official Seal",
        }),
      }),
    );
  });
});
