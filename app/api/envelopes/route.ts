import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { createRawSigningToken, hashSigningToken } from "@/lib/utils/tokens";
import { createEnvelopeSchema } from "@/lib/validations/envelope";
import { getRequestMeta } from "@/lib/utils/request-meta";
import { sendSigningCompletedEmail, sendSigningInviteEmail } from "@/lib/email/smtp";
import { publishWebhook } from "@/lib/integrations/webhook";
import { finalizeEnvelopeArtifacts } from "@/lib/signing/finalize-envelope";
import { buildSigningUrl } from "@/lib/utils/app-url";
import {
  EnvelopeStatus,
  FieldAssignedRole,
  type Prisma,
  SignatureFieldType,
  SignatureFieldValueType,
  SignerRole,
  SignerStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser();
    const payload = await request.json();
    const parsed = createEnvelopeSchema.safeParse(payload);

    if (!parsed.success) {
      console.error("Envelope validation failed", parsed.error.flatten());
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const signerEmails = parsed.data.signers.map((signer) => signer.email.trim().toLowerCase());
    if (new Set(signerEmails).size !== signerEmails.length) {
      return NextResponse.json({ error: "Each signer must have a unique email address." }, { status: 400 });
    }

    const document = await prisma.document.findFirst({
      where: {
        id: parsed.data.documentId,
        ...(user.orgId ? { orgId: user.orgId } : { uploadedByEmail: user.userEmail }),
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const rawToken = createRawSigningToken();
    const tokenHash = hashSigningToken(rawToken);
    const now = new Date();

    const envelope = await prisma.$transaction(async (tx) => {
      const created = await tx.envelope.create({
        data: {
          title: parsed.data.title,
          subject: parsed.data.subject,
          message: parsed.data.message,
          documentId: parsed.data.documentId,
          createdById: user.userId,
          createdByEmail: user.userEmail.toLowerCase(),
          orgId: user.orgId,
          status: EnvelopeStatus.SENT,
          signingTokenHash: tokenHash,
          tokenExpiresAt: new Date(now.getTime() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000),
          sentAt: now,
          signers: {
            create: parsed.data.signers.map((signer) => ({
              name: signer.name.trim(),
              email: signer.email.trim().toLowerCase(),
              signingOrder: signer.signingOrder,
              role: signer.role as SignerRole,
            })),
          },
        },
        include: { signers: true },
      });

      const fieldsForCreate = parsed.data.fields.map((field) => {
        const fieldEmail = field.signerEmail.trim().toLowerCase();
        const signer = created.signers.find((current) => current.email === fieldEmail);
        if (!signer) {
          throw new Error(
            `FIELD_SIGNER_NOT_FOUND:${field.signerEmail}`,
          );
        }
        return {
          signerId: signer.id,
          envelopeId: created.id,
          label: field.label,
          required: field.required ?? true,
          readOnly: field.readOnly ?? false,
          prefillValue: field.prefillValue,
          prefilledBySender: field.prefilledBySender ?? false,
          assignedRole: (field.assignedRole ?? "RECIPIENT") as FieldAssignedRole,
          valueType: (field.valueType
            ?? (field.type === "DATE"
              ? "DATE"
              : field.type === "CHECKBOX"
                ? "CHECKBOX"
                : field.type === "SEAL"
                  ? "STAMP"
                  : field.type === "SIGNATURE" || field.type === "INITIAL"
                    ? "SIGNATURE"
                    : "TEXT")) as SignatureFieldValueType,
          zIndex: field.zIndex ?? 1,
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          type: field.type as SignatureFieldType,
        };
      });

      await tx.signatureField.createMany({ data: fieldsForCreate });

      // Auto-sign the sender: any signer who has at least one pre-filled SENDER field
      // with a non-empty value is treated as having "signed before sending". This avoids
      // sending the first signing invite to the sender themselves and ensures their
      // pre-filled values render on the final document.
      const signersWithSenderPrefill = new Set<string>();
      for (const field of fieldsForCreate) {
        const hasValue = (field.prefillValue ?? "").toString().trim().length > 0;
        if (hasValue && field.prefilledBySender && field.assignedRole === FieldAssignedRole.SENDER) {
          signersWithSenderPrefill.add(field.signerId);
        }
      }

      if (signersWithSenderPrefill.size > 0) {
        // Pick the best signatureValue per signer (image data URL preferred over plain text)
        const signatureChoiceBySigner = new Map<string, { value: string; rank: number }>();
        const sealChoiceBySigner = new Map<string, { value: string; rank: number }>();
        for (const field of fieldsForCreate) {
          if (!signersWithSenderPrefill.has(field.signerId)) continue;
          const raw = (field.prefillValue ?? "").toString().trim();
          if (!raw) continue;
          const isImage =
            raw.toLowerCase().startsWith("data:image/") ||
            raw.toLowerCase().startsWith("http://") ||
            raw.toLowerCase().startsWith("https://");
          const rank = isImage ? 2 : 1;
          if (field.valueType === SignatureFieldValueType.STAMP) {
            const current = sealChoiceBySigner.get(field.signerId);
            if (!current || rank > current.rank) {
              sealChoiceBySigner.set(field.signerId, { value: raw, rank });
            }
          } else if (
            field.valueType === SignatureFieldValueType.SIGNATURE ||
            field.type === SignatureFieldType.SIGNATURE ||
            field.type === SignatureFieldType.INITIAL
          ) {
            const current = signatureChoiceBySigner.get(field.signerId);
            if (!current || rank > current.rank) {
              signatureChoiceBySigner.set(field.signerId, { value: raw, rank });
            }
          }
        }

        for (const signerId of signersWithSenderPrefill) {
          await tx.signer.update({
            where: { id: signerId },
            data: {
              status: SignerStatus.SIGNED,
              signedAt: now,
              signatureValue: signatureChoiceBySigner.get(signerId)?.value ?? undefined,
              sealValue: sealChoiceBySigner.get(signerId)?.value ?? undefined,
            },
          });
        }

        // Refresh the signer list so downstream code (email + audit) reflects the auto-sign.
        const refreshed = await tx.signer.findMany({
          where: { envelopeId: created.id },
          orderBy: { signingOrder: "asc" },
        });
        return { ...created, signers: refreshed, autoSignedSignerIds: Array.from(signersWithSenderPrefill) };
      }

      return { ...created, autoSignedSignerIds: [] as string[] };
    });

    const signingLink = buildSigningUrl(rawToken, request);
    const meta = getRequestMeta(request);

    const auditEntries: Prisma.AuditLogCreateManyInput[] = [
      {
        envelopeId: envelope.id,
        documentId: envelope.documentId,
        actorUserId: user.userId,
        actorEmail: user.userEmail,
        event: "envelope.sent",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: { signerCount: envelope.signers.length, title: envelope.title },
      },
    ];
    const autoSignedSet = new Set(envelope.autoSignedSignerIds);
    for (const signer of envelope.signers) {
      if (!autoSignedSet.has(signer.id)) continue;
      auditEntries.push({
        envelopeId: envelope.id,
        documentId: envelope.documentId,
        actorUserId: user.userId,
        actorEmail: signer.email,
        event: "signer.signed",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: { reason: "Pre-filled by sender before sending", signerId: signer.id },
      });
    }
    await prisma.auditLog.createMany({ data: auditEntries });

    // Invite the next pending (non-CC) signer in signing order. If the sender was auto-signed
    // upfront this naturally skips them, matching the user's intent for "I'll sign before sending".
    const remainingPendingSigners = envelope.signers
      .slice()
      .filter((signer) => signer.role !== "CC" && signer.status !== SignerStatus.SIGNED)
      .sort((a, b) => a.signingOrder - b.signingOrder);
    const firstInOrder = remainingPendingSigners.at(0);

    if (firstInOrder) {
      try {
        await sendSigningInviteEmail({
          toEmail: firstInOrder.email,
          toName: firstInOrder.name,
          envelopeTitle: envelope.title,
          signingLink,
          emailSubject: envelope.subject ?? undefined,
          emailBody: envelope.message ?? undefined,
        });
      } catch (mailError) {
        console.error("Failed to send signing invite email", mailError);
      }
    } else if (autoSignedSet.size > 0) {
      // All non-CC signers are auto-signed by the sender — close the envelope and finalize artifacts.
      try {
        const completedEnv = await prisma.envelope.update({
          where: { id: envelope.id },
          data: { status: EnvelopeStatus.COMPLETED, completedAt: now },
        });
        await finalizeEnvelopeArtifacts({ envelopeId: envelope.id });
        await sendSigningCompletedEmail({
          toEmail: user.userEmail,
          envelopeTitle: completedEnv.title,
        }).catch((mailError) => {
          console.error("Failed to send completed email", mailError);
        });
        await publishWebhook({
          event: "envelope.completed",
          envelopeId: envelope.id,
          orgId: envelope.orgId,
          occurredAt: new Date().toISOString(),
          data: { title: envelope.title, signerCount: envelope.signers.length },
        }).catch((error) => console.error("Failed to publish envelope.completed webhook", error));
      } catch (finalizeError) {
        console.error("Failed to finalize self-signed envelope", finalizeError);
      }
    }

    await publishWebhook({
      event: "envelope.sent",
      envelopeId: envelope.id,
      orgId: envelope.orgId,
      occurredAt: new Date().toISOString(),
      data: {
        title: envelope.title,
        signerCount: envelope.signers.length,
      },
    }).catch((error) => {
      console.error("Failed to publish envelope.sent webhook", error);
    });

    return NextResponse.json({ envelopeId: envelope.id, signingLink }, { status: 201 });
  } catch (error) {
    const message = (error as Error).message ?? "Envelope creation failed";
    console.error("Envelope creation failed", message);
    if (message.startsWith("FIELD_SIGNER_NOT_FOUND:")) {
      const offender = message.replace("FIELD_SIGNER_NOT_FOUND:", "").trim();
      return NextResponse.json(
        {
          error: `One or more fields are assigned to "${offender}" but that signer is not in the recipients list. Please re-assign the fields.`,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Envelope creation failed. Please retry." }, { status: 500 });
  }
}
