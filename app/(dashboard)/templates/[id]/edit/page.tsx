import { notFound } from "next/navigation";
import { prisma } from "@/db/prisma";
import { TemplateBuilderPage } from "@/components/templates/template-builder-page";
import { roleEmail } from "@/lib/templates/role-email";
import { getServerAuthContext } from "@/lib/auth/server-auth";
import { documentScopeWhere, templateScopeWhere } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditTemplatePage({ params }: Props) {
  const { id } = await params;
  const user = await getServerAuthContext();

  const [documents, template] = await Promise.all([
    prisma.document.findMany({
      where: documentScopeWhere(user),
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true },
      take: 50,
    }),
    prisma.template.findFirst({
      where: { id, ...templateScopeWhere(user) },
      include: {
        signers: { orderBy: { signingOrder: "asc" } },
        fields: true,
      },
    }),
  ]);

  if (!template) {
    notFound();
  }

  const roles = template.signers.map((s) => ({
    id: s.id,
    roleName: s.roleName,
    role: s.role,
  }));

  // Best-effort mapping: assign field to role by its TemplateSigner relation (same signing order).
  const signerById = new Map(template.signers.map((s) => [s.id, s]));

  const fields = template.fields.map((f) => {
    const signer = signerById.get(f.templateSignerId);
    const signerEmail = roleEmail(signer?.roleName ?? template.signers[0]?.roleName ?? "Primary Signer");
    return {
      signerEmail,
      label: f.label ?? "",
      required: f.required,
      readOnly: f.readOnly,
      prefillValue: f.prefillValue ?? "",
      prefilledBySender: f.prefilledBySender,
      assignedRole: f.assignedRole,
      valueType: f.valueType,
      zIndex: f.zIndex,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      type: f.type,
    };
  });

  return (
    <TemplateBuilderPage
      documents={documents}
      initial={{
        id: template.id,
        name: template.name,
        description: template.description ?? "",
        documentId: template.documentId,
        roles,
        fields,
      }}
    />
  );
}

