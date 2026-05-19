import { GlassCard } from "@/components/glass/glass-card";
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

  return (
    <GlassCard className="w-full">
      <h2 className="mb-2 text-2xl font-semibold">Send Document</h2>
      <p className="mb-5 max-w-3xl text-sm text-body">
        Choose how you want to proceed, then continue in a guided workflow.
      </p>
      <EnvelopeBuilderForm documents={documents} />
    </GlassCard>
  );
}
