import { prisma } from "@/db/prisma";
import { approveEnvelopeSchema } from "@/lib/validations/envelope";
import { hashSigningToken } from "@/lib/utils/tokens";
import { getRequestMeta } from "@/lib/utils/request-meta";
import { publishWebhook } from "@/lib/integrations/webhook";
import { finalizeEnvelopeArtifacts } from "@/lib/signing/finalize-envelope";
import { sendSigningCompletedEmail, sendSigningInviteEmail } from "@/lib/email/smtp";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { EnvelopeStatus, SignerRole, SignerStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const limit = checkRateLimit(request, "sign-approve-post", 20, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many approval attempts. Please retry shortly." }, { status: 429 });
    }

    const payload = await request.json();
    const parsed = approveEnvelopeSchema.safeParse(payload);
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
      return NextResponse.json({ error: `Envelope is not available for action (${envelope.status})` }, { status: 409 });
    }

    const approver = envelope.signers.find(
      (signer) =>
        (signer.status === SignerStatus.PENDING || signer.status === SignerStatus.VIEWED) &&
        signer.role === SignerRole.APPROVER,
    );
    if (!approver) {
      return NextResponse.json({ error: "No pending approver found for this envelope" }, { status: 409 });
    }

    const meta = getRequestMeta(request);
    await prisma.$transaction(async (tx) => {
      await tx.signer.update({
        where: { id: approver.id },
        data: {
          status: SignerStatus.SIGNED,
          signedAt: new Date(),
        },
      });

      const pendingAfter = await tx.signer.count({
        where: {
          envelopeId: envelope.id,
          role: { not: SignerRole.CC },
          status: { in: [SignerStatus.PENDING, SignerStatus.VIEWED] },
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
          actorEmail: approver.email,
          event: "approver.approved",
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          metadata: {
            note: parsed.data.note ?? null,
          },
        },
      });
    });

    const refreshed = await prisma.envelope.findUnique({
      where: { id: envelope.id },
      include: {
        signers: { orderBy: { signingOrder: "asc" } },
      },
    });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
    const signingLink = `${appUrl}/sign/${parsed.data.token}`;
    const nextRecipient = refreshed?.signers.find(
      (signer) =>
        (signer.status === SignerStatus.PENDING || signer.status === SignerStatus.VIEWED) &&
        signer.role !== SignerRole.CC,
    );

    if (nextRecipient && refreshed) {
      await sendSigningInviteEmail({
        toEmail: nextRecipient.email,
        toName: nextRecipient.name,
        envelopeTitle: refreshed.title,
        signingLink,
        emailSubject: refreshed.subject ?? undefined,
        emailBody: refreshed.message ?? undefined,
      }).catch((error) => {
        console.error("Failed to send next recipient invite email", error);
      });
    } else if (refreshed) {
      await finalizeEnvelopeArtifacts({ envelopeId: refreshed.id }).catch((error) => {
        console.error("Failed to finalize envelope artifacts", error);
      });
      await sendSigningCompletedEmail({
        toEmail: refreshed.createdByEmail,
        envelopeTitle: refreshed.title,
      }).catch((error) => {
        console.error("Failed to send completion email", error);
      });
    }

    await publishWebhook({
      event: "signer.signed",
      envelopeId: envelope.id,
      orgId: envelope.orgId,
      occurredAt: new Date().toISOString(),
      data: {
        approverEmail: approver.email,
        note: parsed.data.note ?? null,
      },
    }).catch((error) => {
      console.error("Failed to publish approver webhook", error);
    });

    if (refreshed?.status === EnvelopeStatus.COMPLETED) {
      await publishWebhook({
        event: "envelope.completed",
        envelopeId: envelope.id,
        orgId: envelope.orgId,
        occurredAt: new Date().toISOString(),
        data: {
          title: refreshed.title,
        },
      }).catch((error) => {
        console.error("Failed to publish envelope.completed webhook", error);
      });
    }

    return NextResponse.json({ status: "approved", approverEmail: approver.email });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
