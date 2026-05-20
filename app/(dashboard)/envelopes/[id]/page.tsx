import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/db/prisma";
import { getServerAuthContext } from "@/lib/auth/server-auth";
import { envelopeScopeWhere } from "@/lib/auth/scope";
import { EnvelopePreviewClient, type PreviewEnvelope } from "@/components/envelopes/envelope-preview-client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function EnvelopeDetailPage({ params }: Params) {
  const { id } = await params;
  const user = await getServerAuthContext();

  const envelope = await prisma.envelope.findFirst({
    where: {
      id,
      ...envelopeScopeWhere(user),
    },
    include: {
      document: true,
      signers: { orderBy: { signingOrder: "asc" } },
      signatureFields: { orderBy: [{ page: "asc" }, { y: "asc" }] },
    },
  });

  if (!envelope) {
    notFound();
  }

  const signerById = new Map(envelope.signers.map((signer) => [signer.id, signer]));

  const preview: PreviewEnvelope = {
    id: envelope.id,
    title: envelope.title,
    status: envelope.status,
    sentAt: envelope.sentAt ? envelope.sentAt.toISOString() : null,
    completedAt: envelope.completedAt ? envelope.completedAt.toISOString() : null,
    voidedAt: envelope.voidedAt ? envelope.voidedAt.toISOString() : null,
    declinedReason: envelope.declinedReason ?? null,
    voidReason: envelope.voidReason ?? null,
    documentFileName: envelope.document?.fileName ?? "Document",
    documentUrl: `/api/documents/${envelope.documentId}/file`,
    signedDocumentAvailable: Boolean(envelope.signedCloudinaryId),
    signers: envelope.signers.map((signer) => ({
      id: signer.id,
      name: signer.name,
      email: signer.email,
      role: signer.role,
      status: signer.status,
      signingOrder: signer.signingOrder,
      signedAt: signer.signedAt ? signer.signedAt.toISOString() : null,
      declinedAt: signer.declinedAt ? signer.declinedAt.toISOString() : null,
      viewedAt: signer.viewedAt ? signer.viewedAt.toISOString() : null,
      signatureValue: signer.signatureValue ?? null,
      sealValue: signer.sealValue ?? null,
    })),
    fields: envelope.signatureFields.map((field) => {
      const signer = signerById.get(field.signerId);
      return {
        id: field.id,
        signerEmail: signer?.email ?? "",
        signerName: signer?.name ?? "Recipient",
        signerStatus: signer?.status ?? "PENDING",
        signerSignedAt: signer?.signedAt ? signer.signedAt.toISOString() : null,
        signerSignatureValue: signer?.signatureValue ?? null,
        signerSealValue: signer?.sealValue ?? null,
        assignedRole: field.assignedRole,
        prefilledBySender: field.prefilledBySender,
        prefillValue: field.prefillValue ?? "",
        readOnly: field.readOnly,
        valueType: field.valueType,
        type: field.type,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        zIndex: field.zIndex,
        required: field.required,
        label: field.label ?? "",
      };
    }),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-label uppercase">Envelope</p>
          <h1 className="text-heading text-2xl">{envelope.title}</h1>
          <p className="text-sm text-body">{envelope.document?.fileName ?? "Document"}</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-medium text-body hover:bg-surface"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to dashboard
        </Link>
      </div>
      <EnvelopePreviewClient envelope={preview} />
    </div>
  );
}
