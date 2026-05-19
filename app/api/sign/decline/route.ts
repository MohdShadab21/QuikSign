import { prisma } from "@/db/prisma";
import { hashSigningToken } from "@/lib/utils/tokens";
import { declineEnvelopeSchema } from "@/lib/validations/envelope";
import { getRequestMeta } from "@/lib/utils/request-meta";
import { publishWebhook } from "@/lib/integrations/webhook";
import { sendSigningDeclinedEmail } from "@/lib/email/smtp";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { EnvelopeStatus, SignerRole, SignerStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const limit = checkRateLimit(request, "sign-decline-post", 20, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many decline attempts. Please retry shortly." }, { status: 429 });
    }

    const payload = await request.json();
    const parsed = declineEnvelopeSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const tokenHash = hashSigningToken(parsed.data.token);
    const envelope = await prisma.envelope.findFirst({
      where: {
        signingTokenHash: tokenHash,
        tokenExpiresAt: { gte: new Date() },
      },
      include: {
        signers: { orderBy: { signingOrder: "asc" } },
      },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }
    if (envelope.status !== EnvelopeStatus.SENT) {
      return NextResponse.json({ error: `Envelope is not available for signing (${envelope.status})` }, { status: 409 });
    }

    const signer = envelope.signers.find(
      (current) =>
        (current.status === SignerStatus.PENDING || current.status === SignerStatus.VIEWED) &&
        current.role !== SignerRole.CC,
    );
    if (!signer) {
      return NextResponse.json({ error: "No pending signer for this envelope" }, { status: 409 });
    }

    const meta = getRequestMeta(request);
    await prisma.$transaction(async (tx) => {
      await tx.signer.update({
        where: { id: signer.id },
        data: {
          status: SignerStatus.DECLINED,
          declinedAt: new Date(),
        },
      });
      await tx.envelope.update({
        where: { id: envelope.id },
        data: {
          status: EnvelopeStatus.DECLINED,
          declinedReason: parsed.data.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          envelopeId: envelope.id,
          documentId: envelope.documentId,
          actorEmail: signer.email,
          event: "signer.declined",
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          metadata: {
            reason: parsed.data.reason,
          },
        },
      });
    });

    await publishWebhook({
      event: "envelope.declined",
      envelopeId: envelope.id,
      orgId: envelope.orgId,
      occurredAt: new Date().toISOString(),
      data: {
        signerEmail: signer.email,
        reason: parsed.data.reason,
      },
    }).catch((error) => {
      console.error("Failed to publish envelope.declined webhook", error);
    });

    await sendSigningDeclinedEmail({
      toEmail: envelope.createdByEmail,
      envelopeTitle: envelope.title,
      declinedByEmail: signer.email,
      declinedByName: signer.name,
      reason: parsed.data.reason,
    }).catch((error) => {
      console.error("Failed to send decline notification email", error);
    });

    return NextResponse.json({ status: "declined", signerEmail: signer.email });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
