import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { createTemplateSchema } from "@/lib/validations/envelope";
import { SignerRole, SignatureFieldType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await getRequestUser();
    const { id } = await params;

    const template = await prisma.template.findFirst({
      where: {
        id,
        orgId: user.orgId ?? undefined,
      },
      include: {
        document: { select: { id: true, fileName: true } },
        signers: { orderBy: { signingOrder: "asc" } },
        fields: true,
      },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await getRequestUser();
    const { id } = await params;

    const template = await prisma.template.findFirst({
      where: { id, orgId: user.orgId ?? undefined },
      select: { id: true },
    });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await prisma.template.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await getRequestUser();
    const { id } = await params;
    const payload = await request.json();

    const parsed = createTemplateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.template.findFirst({
      where: { id, orgId: user.orgId ?? undefined },
      include: { signers: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const template = await tx.template.update({
        where: { id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          documentId: parsed.data.documentId,
          updatedAt: new Date(),
        },
        include: { signers: true },
      });

      await tx.templateField.deleteMany({ where: { templateId: id } });
      await tx.templateSigner.deleteMany({ where: { templateId: id } });

      const signers = await Promise.all(
        parsed.data.signers.map((signer) =>
          tx.templateSigner.create({
            data: {
              templateId: id,
              roleName: signer.roleName,
              role: signer.role as SignerRole,
              signingOrder: signer.signingOrder,
            },
          }),
        ),
      );

      const fields = parsed.data.fields.map((field) => {
        const templateSigner = signers.find((s) => s.roleName === field.roleName);
        if (!templateSigner) {
          throw new Error(`Template signer role not found: ${field.roleName}`);
        }
        return {
          templateId: id,
          templateSignerId: templateSigner.id,
          label: field.label,
          required: field.required ?? true,
          readOnly: field.readOnly ?? false,
          prefillValue: field.prefillValue,
          prefilledBySender: field.prefilledBySender ?? false,
          assignedRole: field.assignedRole ?? "RECIPIENT",
          valueType: field.valueType ?? "SIGNATURE",
          zIndex: field.zIndex ?? 1,
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          type: field.type as SignatureFieldType,
        };
      });
      try {
        await tx.templateField.createMany({ data: fields });
      } catch (error) {
        const message = (error as Error).message ?? "";
        const isLegacyClientMismatch =
          message.includes("Unknown argument `label`")
          || message.includes("Unknown argument `required`")
          || message.includes("Unknown argument `readOnly`");
        if (!isLegacyClientMismatch) {
          throw error;
        }
        const legacyFields = fields.map((field) => ({
          templateId: field.templateId,
          templateSignerId: field.templateSignerId,
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          type: field.type,
        }));
        console.warn(
          "TemplateField createMany fallback (PATCH): runtime Prisma client does not include extended columns yet. " +
            "Run `npx prisma migrate dev` and `npx prisma generate`.",
        );
        await tx.templateField.createMany({ data: legacyFields });
      }

      return template;
    });

    return NextResponse.json({ templateId: updated.id });
  } catch (error) {
    const message = (error as Error).message ?? "Template update failed";
    const isRuntimeSchemaMismatch =
      message.includes("Unknown argument `label`")
      || message.includes("Unknown argument `required`")
      || message.includes("Unknown argument `readOnly`")
      || message.includes("tx.templateField.createMany");
    if (isRuntimeSchemaMismatch) {
      return NextResponse.json(
        {
          error:
            "Server schema is out of sync with template field updates. Please restart dev server and run prisma generate.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
