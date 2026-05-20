import { prisma } from "@/db/prisma";
import { TemplateBuilderPage } from "@/components/templates/template-builder-page";
import { getServerAuthContext } from "@/lib/auth/server-auth";
import { documentScopeWhere } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const user = await getServerAuthContext();
  const documents = await prisma.document.findMany({
    where: documentScopeWhere(user),
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true },
    take: 50,
  });

  return (
    <TemplateBuilderPage
      documents={documents}
      initial={{
        name: "",
        description: "",
        documentId: documents[0]?.id ?? "",
        roles: [{ id: "role_1", roleName: "Primary Signer", role: "SIGNER" }],
        fields: [],
      }}
    />
  );
}
