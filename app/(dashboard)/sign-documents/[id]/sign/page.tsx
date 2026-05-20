import { notFound } from "next/navigation";
import { prisma } from "@/db/prisma";
import { getServerAuthContext } from "@/lib/auth/server-auth";
import { documentScopeWhere } from "@/lib/auth/scope";
import { getSignedDocumentUrl } from "@/lib/cloudinary/upload";
import { SignDocumentEditor } from "@/components/sign-documents/sign-document-editor";
import type { DesignerField } from "@/components/envelopes/pdf-field-designer";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };
type SignDocumentSnapshot = {
  fields?: DesignerField[];
  signerName?: string;
  signerEmail?: string;
  signatureValue?: string;
  sealValue?: string;
};

export default async function SignDocumentSignPage({ params }: Props) {
  const user = await getServerAuthContext();
  const { id } = await params;

  const document = await prisma.document.findFirst({
    where: { id, ...documentScopeWhere(user) },
    select: {
      id: true,
      fileName: true,
      cloudinaryId: true,
      auditLogs: {
        where: { event: "SIGN_DOCUMENT_SAVED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { metadata: true, createdAt: true },
      },
    },
  });
  if (!document) notFound();
  const latestSnapshot = (document.auditLogs[0]?.metadata ?? null) as SignDocumentSnapshot | null;

  return (
    <SignDocumentEditor
      documentId={document.id}
      documentName={document.fileName}
      documentUrl={getSignedDocumentUrl(document.cloudinaryId)}
      initialFields={Array.isArray(latestSnapshot?.fields) ? latestSnapshot.fields : []}
      initialSignerName={latestSnapshot?.signerName ?? ""}
      initialSignerEmail={latestSnapshot?.signerEmail ?? ""}
      initialSignatureValue={latestSnapshot?.signatureValue ?? ""}
      initialSealValue={latestSnapshot?.sealValue ?? ""}
      hasServerSnapshot={Boolean(latestSnapshot)}
      serverSnapshotCreatedAt={document.auditLogs[0]?.createdAt.toISOString() ?? ""}
      mode="sign"
    />
  );
}
