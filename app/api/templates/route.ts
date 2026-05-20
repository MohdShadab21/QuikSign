import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { documentScopeWhere, templateScopeWhere } from "@/lib/auth/scope";
import { createTemplateSchema } from "@/lib/validations/envelope";
import { SignerRole, SignatureFieldType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await getRequestUser();
    const templates = await prisma.template.findMany({
      where: templateScopeWhere(user),
      include: {
        document: { select: { id: true, fileName: true } },
        signers: { orderBy: { signingOrder: "asc" } },
        fields: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser();
    const payload = await request.json();
    const parsed = createTemplateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const ownedDocument = await prisma.document.findFirst({
      where: { id: parsed.data.documentId, ...documentScopeWhere(user) },
      select: { id: true },
    });
    if (!ownedDocument) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.template.create({
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          documentId: parsed.data.documentId,
          createdById: user.userId,
          createdByEmail: user.userEmail,
          orgId: user.orgId,
          signers: {
            create: parsed.data.signers.map((signer) => ({
              roleName: signer.roleName,
              role: signer.role as SignerRole,
              signingOrder: signer.signingOrder,
            })),
          },
        },
        include: {
          signers: true,
        },
      });

      const fields = parsed.data.fields.map((field) => {
        const templateSigner = created.signers.find((s) => s.roleName === field.roleName);
        if (!templateSigner) {
          throw new Error(`Template signer role not found: ${field.roleName}`);
        }
        return {
          templateId: created.id,
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
          "TemplateField createMany fallback: runtime Prisma client does not include extended columns yet. " +
            "Run `npx prisma migrate dev` and `npx prisma generate`.",
        );
        await tx.templateField.createMany({ data: legacyFields });
      }
      return created;
    });

    return NextResponse.json({ templateId: template.id }, { status: 201 });
  } catch (error) {
    const message = (error as Error).message ?? "Template creation failed";
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
