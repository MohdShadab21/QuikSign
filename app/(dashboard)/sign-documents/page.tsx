import { prisma } from "@/db/prisma";
import { getRequestUser } from "@/lib/auth/request-user";
import { getSignedDocumentUrl } from "@/lib/cloudinary/upload";
import { isSignedCopyFileName } from "@/lib/documents/signed-copy-name";
import { SignDocumentManager } from "@/components/sign-documents/sign-document-manager";

export const dynamic = "force-dynamic";

export default async function SignDocumentsPage() {
  const user = await getRequestUser().catch(() => null);
  const documents = await prisma.document.findMany({
    where: user ? { orgId: user.orgId ?? undefined } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      fileName: true,
      cloudinaryId: true,
      createdAt: true,
      auditLogs: {
        where: { event: "SIGN_DOCUMENT_SAVED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { metadata: true },
      },
    },
  });

  return (
    <SignDocumentManager
        initialDocuments={documents.map((d) => ({
          id: d.id,
          fileName: d.fileName,
          signedDownloadUrl: getSignedDocumentUrl(d.cloudinaryId),
          createdAt: d.createdAt.toISOString(),
          isSignedCopy: isSignedCopyFileName(d.fileName),
          hasPlacedFields: Array.isArray((d.auditLogs[0]?.metadata as { fields?: unknown[] } | null)?.fields)
            ? ((d.auditLogs[0]?.metadata as { fields?: unknown[] }).fields?.length ?? 0) > 0
            : false,
        }))}
    />
  );
}

