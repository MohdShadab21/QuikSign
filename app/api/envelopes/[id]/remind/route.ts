import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { sendSigningInviteEmail } from "@/lib/email/smtp";
import { publishWebhook } from "@/lib/integrations/webhook";
import { createRawSigningToken, hashSigningToken } from "@/lib/utils/tokens";
import { EnvelopeStatus, SignerRole, SignerStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await getRequestUser();
    const { id } = await params;

    const envelope = await prisma.envelope.findFirst({
      where: {
        id,
        ...(user.orgId ? { orgId: user.orgId } : { createdByEmail: user.userEmail.toLowerCase() }),
      },
      include: {
        signers: {
          orderBy: { signingOrder: "asc" },
        },
      },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Envelope not found" }, { status: 404 });
    }
    if (envelope.status !== EnvelopeStatus.SENT) {
      return NextResponse.json({ error: "Only sent envelopes can be reminded" }, { status: 409 });
    }

    const nextSigner = envelope.signers.find(
      (signer) =>
        (signer.status === SignerStatus.PENDING || signer.status === SignerStatus.VIEWED) &&
        signer.role !== SignerRole.CC,
    );
    if (!nextSigner) {
      return NextResponse.json({ error: "No pending signer found" }, { status: 409 });
    }

    const rawToken = createRawSigningToken();
    const tokenHash = hashSigningToken(rawToken);
    await prisma.envelope.update({
      where: { id: envelope.id },
      data: {
        signingTokenHash: tokenHash,
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
    const signingLink = `${appUrl}/sign/${rawToken}`;
    await sendSigningInviteEmail({
      toEmail: nextSigner.email,
      toName: nextSigner.name,
      envelopeTitle: envelope.title,
      signingLink,
      emailSubject: envelope.subject ?? undefined,
      emailBody: envelope.message ?? undefined,
    });

    await prisma.auditLog.create({
      data: {
        envelopeId: envelope.id,
        documentId: envelope.documentId,
        actorUserId: user.userId,
        actorEmail: user.userEmail,
        event: "signer.reminded",
      },
    });

    await publishWebhook({
      event: "envelope.reminder_sent",
      envelopeId: envelope.id,
      orgId: envelope.orgId,
      occurredAt: new Date().toISOString(),
      data: { signerEmail: nextSigner.email },
    }).catch((error) => {
      console.error("Failed to publish envelope.reminder_sent webhook", error);
    });

    return NextResponse.json({ status: "reminder_sent", signerEmail: nextSigner.email });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
