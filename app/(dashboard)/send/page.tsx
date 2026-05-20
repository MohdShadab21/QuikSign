import { prisma } from "@/db/prisma";
import { EnvelopeBuilderForm } from "@/components/envelopes/envelope-builder-form";
import { getServerAuthContext } from "@/lib/auth/server-auth";
import { documentScopeWhere, templateScopeWhere } from "@/lib/auth/scope";
import { buildEnvelopePrefillFromTemplate } from "@/lib/templates/template-prefill";

export const dynamic = "force-dynamic";

export default async function SendDocumentPage({
  searchParams,
}: {
  searchParams?: Promise<{ templateId?: string }>;
}) {
  const params = await searchParams;
  const templateId = params?.templateId?.trim() ?? "";

  const user = await getServerAuthContext();

  const [documents, template] = await Promise.all([
    prisma.document.findMany({
      where: documentScopeWhere(user),
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true },
      take: 50,
    }),
    templateId
      ? prisma.template.findFirst({
          where: { id: templateId, ...templateScopeWhere(user) },
          include: {
            signers: { orderBy: { signingOrder: "asc" } },
            fields: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const templatePrefill = template ? buildEnvelopePrefillFromTemplate(template) : null;

  return <EnvelopeBuilderForm documents={documents} templatePrefill={templatePrefill} />;
}
