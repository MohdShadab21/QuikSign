import { TemplateLibrary } from "@/components/templates/template-library";
import { prisma } from "@/db/prisma";
import { getServerAuthContext } from "@/lib/auth/server-auth";
import { templateScopeWhere } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await getServerAuthContext();
  const templates = await prisma.template.findMany({
    where: templateScopeWhere(user),
    orderBy: { createdAt: "desc" },
    include: {
      document: { select: { id: true, fileName: true } },
      signers: {
        orderBy: { signingOrder: "asc" },
      },
      fields: { select: { page: true } },
    },
    take: 50,
  });

  return (
    <TemplateLibrary
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        documentId: t.documentId,
        document: t.document,
        updatedAt: t.updatedAt.toISOString(),
        signers: t.signers.map((s) => ({
          roleName: s.roleName,
          role: s.role,
          signingOrder: s.signingOrder,
        })),
        fields: t.fields,
      }))}
    />
  );
}
