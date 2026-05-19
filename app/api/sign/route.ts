import { prisma } from "@/db/prisma";
import { hashSigningToken } from "@/lib/utils/tokens";
import { signEnvelopeSchema } from "@/lib/validations/envelope";
import { getRequestMeta } from "@/lib/utils/request-meta";
import { sendSigningCompletedEmail, sendSigningInviteEmail } from "@/lib/email/smtp";
import { publishWebhook } from "@/lib/integrations/webhook";
import { finalizeEnvelopeArtifacts } from "@/lib/signing/finalize-envelope";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { buildSigningUrl } from "@/lib/utils/app-url";
import { EnvelopeStatus, SignerRole, SignerStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const limit = checkRateLimit(request, "sign-post", 20, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many signing attempts. Please retry shortly." }, { status: 429 });
    }

    const payload = await request.json();
    const parsed = signEnvelopeSchema.safeParse(payload);
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
        signers: {
          orderBy: { signingOrder: "asc" },
        },
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
    if (signer.role === SignerRole.APPROVER) {
      return NextResponse.json({ error: "Approver actions must use /api/sign/approve" }, { status: 409 });
    }

    const meta = getRequestMeta(request);

    await prisma.$transaction(async (tx) => {
      await tx.signer.update({
        where: { id: signer.id },
        data: {
          status: SignerStatus.SIGNED,
          signatureValue: parsed.data.signatureValue || parsed.data.initialValue || null,
          sealValue: parsed.data.sealValue ?? null,
          signedAt: new Date(),
        },
      });

      if (parsed.data.fieldValues.length > 0) {
        const signerFieldIds = (
          await tx.signatureField.findMany({
            where: { envelopeId: envelope.id, signerId: signer.id },
            select: { id: true },
          })
        ).map((field) => field.id);
        const allowed = new Set(signerFieldIds);
        for (const entry of parsed.data.fieldValues) {
          if (!allowed.has(entry.fieldId)) continue;
          await tx.signatureField.update({
            where: { id: entry.fieldId },
            data: { prefillValue: entry.value },
          });
        }
      }

      const pendingAfter = await tx.signer.count({
        where: {
          envelopeId: envelope.id,
          status: { in: [SignerStatus.PENDING, SignerStatus.VIEWED] },
          role: { not: SignerRole.CC },
        },
      });

      if (pendingAfter === 0) {
        await tx.envelope.update({
          where: { id: envelope.id },
          data: { status: EnvelopeStatus.COMPLETED, completedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          envelopeId: envelope.id,
          documentId: envelope.documentId,
          actorEmail: signer.email,
          event: "signer.signed",
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          metadata: {
            signatureType: parsed.data.signatureType,
            signatureLength: parsed.data.signatureValue.length,
            hasSeal: Boolean(parsed.data.sealValue && parsed.data.sealValue.trim().length > 0),
            consentAccepted: parsed.data.consentAccepted,
          },
        },
      });
    });

    const refreshedEnvelope = await prisma.envelope.findUnique({
      where: { id: envelope.id },
      include: {
        signers: {
          orderBy: { signingOrder: "asc" },
        },
      },
    });

    const signingLink = buildSigningUrl(parsed.data.token, request);
    const nextSigner = refreshedEnvelope?.signers.find(
      (current) =>
        (current.status === SignerStatus.PENDING || current.status === SignerStatus.VIEWED) &&
        current.role !== SignerRole.CC,
    );

    if (nextSigner && refreshedEnvelope) {
      try {
        await sendSigningInviteEmail({
          toEmail: nextSigner.email,
          toName: nextSigner.name,
          envelopeTitle: refreshedEnvelope.title,
          signingLink,
          emailSubject: refreshedEnvelope.subject ?? undefined,
          emailBody: refreshedEnvelope.message ?? undefined,
        });
      } catch (mailError) {
        console.error("Failed to send next signer invite email", mailError);
      }
    }

    await publishWebhook({
      event: "signer.signed",
      envelopeId: envelope.id,
      orgId: envelope.orgId,
      occurredAt: new Date().toISOString(),
      data: {
        signerEmail: signer.email,
      },
    }).catch((error) => {
      console.error("Failed to publish signer.signed webhook", error);
    });

    if (!nextSigner && refreshedEnvelope?.status === EnvelopeStatus.COMPLETED) {
      await finalizeEnvelopeArtifacts({ envelopeId: refreshedEnvelope.id }).catch((error) => {
        console.error("Failed to finalize envelope artifacts", error);
      });

      try {
        await sendSigningCompletedEmail({
          toEmail: refreshedEnvelope.createdByEmail,
          envelopeTitle: refreshedEnvelope.title,
        });
      } catch (mailError) {
        console.error("Failed to send completion email", mailError);
      }

      await publishWebhook({
        event: "envelope.completed",
        envelopeId: refreshedEnvelope.id,
        orgId: refreshedEnvelope.orgId,
        occurredAt: new Date().toISOString(),
      }).catch((error) => {
        console.error("Failed to publish envelope.completed webhook", error);
      });
    }

    return NextResponse.json({ status: "signed", signerEmail: signer.email });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
