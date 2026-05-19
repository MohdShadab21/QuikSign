import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { publishWebhook } from "@/lib/integrations/webhook";
import { sendEnvelopeVoidedEmail } from "@/lib/email/smtp";
import { voidEnvelopeSchema } from "@/lib/validations/envelope";
import { EnvelopeStatus, SignerRole, SignerStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await getRequestUser();
    const { id } = await params;
    const payload = await request.json().catch(() => ({}));
    const parsed = voidEnvelopeSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const envelope = await prisma.envelope.findFirst({
      where: {
        id,
        ...(user.orgId ? { orgId: user.orgId } : { createdByEmail: user.userEmail.toLowerCase() }),
      },
      include: { signers: true },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Envelope not found" }, { status: 404 });
    }
    if (envelope.status === EnvelopeStatus.COMPLETED) {
      return NextResponse.json({ error: "Completed envelopes cannot be voided" }, { status: 409 });
    }
    if (envelope.status === EnvelopeStatus.VOIDED) {
      return NextResponse.json({ error: "Envelope is already voided" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.envelope.update({
        where: { id: envelope.id },
        data: {
          status: EnvelopeStatus.VOIDED,
          voidedAt: new Date(),
          voidReason: parsed.data.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          envelopeId: envelope.id,
          documentId: envelope.documentId,
          actorUserId: user.userId,
          actorEmail: user.userEmail,
          event: "envelope.voided",
          metadata: {
            reason: parsed.data.reason ?? null,
          },
        },
      });
    });

    await publishWebhook({
      event: "envelope.voided",
      envelopeId: envelope.id,
      orgId: envelope.orgId,
      occurredAt: new Date().toISOString(),
      data: {
        reason: parsed.data.reason ?? null,
      },
    }).catch((error) => {
      console.error("Failed to publish envelope.voided webhook", error);
    });

    const recipientsToNotify = envelope.signers.filter(
      (signer) =>
        signer.role !== SignerRole.CC &&
        (signer.status === SignerStatus.PENDING || signer.status === SignerStatus.VIEWED),
    );
    await Promise.all(
      recipientsToNotify.map((signer) =>
        sendEnvelopeVoidedEmail({
          toEmail: signer.email,
          toName: signer.name,
          envelopeTitle: envelope.title,
          reason: parsed.data.reason ?? null,
        }).catch((error) => {
          console.error(`Failed to notify ${signer.email} of void`, error);
        }),
      ),
    );

    return NextResponse.json({ status: "voided", envelopeId: envelope.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
