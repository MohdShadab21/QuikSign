import type { Prisma } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { EnvelopeBuilderForm } from "@/components/envelopes/envelope-builder-form";
import { getRequestUser } from "@/lib/auth/request-user";
import { buildEnvelopePrefillFromTemplate } from "@/lib/templates/template-prefill";

export const dynamic = "force-dynamic";

export default async function SendDocumentPage({
  searchParams,
}: {
  searchParams?: Promise<{ templateId?: string }>;
}) {
  const params = await searchParams;
  const templateId = params?.templateId?.trim() ?? "";

  const user = await getRequestUser().catch(() => null);

  const templateWhere: Prisma.TemplateWhereInput = templateId
    ? user
      ? user.orgId
        ? { id: templateId, orgId: user.orgId }
        : { id: templateId, createdByEmail: user.userEmail.toLowerCase() }
      : { id: templateId }
    : { id: "__none__" };

  const [documents, template] = await Promise.all([
    prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true },
      take: 50,
    }),
    templateId
      ? prisma.template.findFirst({
          where: templateWhere,
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
