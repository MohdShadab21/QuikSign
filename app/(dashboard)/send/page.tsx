import { prisma } from "@/db/prisma";
import { EnvelopeBuilderForm } from "@/components/envelopes/envelope-builder-form";

export const dynamic = "force-dynamic";

export default async function SendDocumentPage({
  searchParams,
}: {
  searchParams?: Promise<{ templateId?: string }>;
}) {
  await searchParams;
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true },
    take: 50,
  });

  return <EnvelopeBuilderForm documents={documents} />;
}
