import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { createRawSigningToken, hashSigningToken } from "@/lib/utils/tokens";
import { sendSigningInviteEmail } from "@/lib/email/smtp";
import { buildSigningUrl } from "@/lib/utils/app-url";
import { EnvelopeStatus, SignerRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type Params = {
  params: Promise<{ id: string }>;
};

const applyTemplateSchema = z.object({
  title: z.string().min(2).max(200),
  subject: z.string().min(2).max(250).optional(),
  message: z.string().max(5000).optional(),
  expiresInDays: z.number().int().min(1).max(60).default(7),
  recipients: z.array(
    z.object({
      roleName: z.string().min(2).max(120),
      name: z.string().min(2).max(120),
      email: z.string().email(),
    }),
  ),
});

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await getRequestUser();
    const { id } = await params;
    const payload = await request.json();
    const parsed = applyTemplateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const template = await prisma.template.findFirst({
      where: { id, orgId: user.orgId ?? undefined },
      include: {
        signers: { orderBy: { signingOrder: "asc" } },
        fields: true,
      },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const recipientMap = new Map(parsed.data.recipients.map((recipient) => [recipient.roleName, recipient]));
    for (const signerRole of template.signers) {
      if (!recipientMap.has(signerRole.roleName)) {
        return NextResponse.json({ error: `Missing recipient for role ${signerRole.roleName}` }, { status: 400 });
      }
    }

    const rawToken = createRawSigningToken();
    const tokenHash = hashSigningToken(rawToken);

    const envelope = await prisma.$transaction(async (tx) => {
      const created = await tx.envelope.create({
        data: {
          title: parsed.data.title,
          subject: parsed.data.subject,
          message: parsed.data.message,
          documentId: template.documentId,
          createdById: user.userId,
          createdByEmail: user.userEmail,
          orgId: user.orgId,
          status: EnvelopeStatus.SENT,
          signingTokenHash: tokenHash,
          tokenExpiresAt: new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000),
          signers: {
            create: template.signers.map((templateSigner) => {
              const recipient = recipientMap.get(templateSigner.roleName);
              if (!recipient) {
                throw new Error(`Missing recipient for role ${templateSigner.roleName}`);
              }

              return {
                name: recipient.name,
                email: recipient.email,
                signingOrder: templateSigner.signingOrder,
                role: templateSigner.role as SignerRole,
              };
            }),
          },
        },
        include: { signers: true },
      });

      const fields = template.fields.map((field) => {
        const templateSigner = template.signers.find((signer) => signer.id === field.templateSignerId);
        if (!templateSigner) {
          throw new Error("Template signer mismatch");
        }
        const targetSigner = created.signers.find((signer) => signer.signingOrder === templateSigner.signingOrder);
        if (!targetSigner) {
          throw new Error("Envelope signer mismatch");
        }
        return {
          envelopeId: created.id,
          signerId: targetSigner.id,
          label: field.label,
          required: field.required,
          readOnly: field.readOnly,
          prefillValue: field.prefillValue ?? undefined,
          prefilledBySender: field.prefilledBySender,
          assignedRole: field.assignedRole,
          valueType: field.valueType,
          zIndex: field.zIndex,
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          type: field.type,
        };
      });

      await tx.signatureField.createMany({ data: fields });
      return created;
    });

    const firstSigner = envelope.signers
      .filter((signer) => signer.role !== SignerRole.CC)
      .sort((a, b) => a.signingOrder - b.signingOrder)[0];

    if (firstSigner) {
      await sendSigningInviteEmail({
        toEmail: firstSigner.email,
        toName: firstSigner.name,
        envelopeTitle: envelope.title,
        signingLink: buildSigningUrl(rawToken, request),
        emailSubject: envelope.subject ?? undefined,
        emailBody: envelope.message ?? undefined,
      }).catch((error) => {
        console.error("Failed to send template invite", error);
      });
    }

    return NextResponse.json({ envelopeId: envelope.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
