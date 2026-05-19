import { prisma } from "@/db/prisma";
import { TemplateBuilderPage } from "@/components/templates/template-builder-page";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const documents = await prisma.document.findMany({
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

