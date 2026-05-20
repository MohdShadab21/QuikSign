import { prisma } from "@/db/prisma";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getServerAuthContext } from "@/lib/auth/server-auth";
import { envelopeScopeWhere } from "@/lib/auth/scope";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getServerAuthContext();
  const envelopeWhere = envelopeScopeWhere(user);

  const auditWhere: Prisma.AuditLogWhereInput = user.orgId
    ? { envelope: { orgId: user.orgId } }
    : { actorEmail: user.userEmail.toLowerCase() };

  const [envelopes, auditLogs] = await Promise.all([
    prisma.envelope
      .findMany({
        where: envelopeWhere,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          signers: { orderBy: { signingOrder: "asc" } },
          document: { select: { fileName: true } },
        },
      })
      .catch(() => []),
    prisma.auditLog.findMany({ where: auditWhere, orderBy: { createdAt: "desc" }, take: 200 }).catch(() => []),
  ]);
  const completedCount = envelopes.filter((entry) => entry.status === "COMPLETED").length;
  const sentCount = envelopes.filter((entry) => entry.status === "SENT").length;
  const declinedCount = envelopes.filter((entry) => entry.status === "DECLINED").length;
  const voidedCount = envelopes.filter((entry) => entry.status === "VOIDED").length;

  return (
    <DashboardClient
      envelopes={envelopes.map((entry) => ({
        id: entry.id,
        title: entry.title,
        documentFileName: entry.document?.fileName ?? null,
        status: entry.status,
        signers: entry.signers.map((signer) => ({
          id: signer.id,
          name: signer.name,
          email: signer.email,
          role: signer.role,
          status: signer.status,
          signingOrder: signer.signingOrder,
          signedAt: signer.signedAt?.toISOString() ?? null,
          declinedAt: signer.declinedAt?.toISOString() ?? null,
          viewedAt: signer.viewedAt?.toISOString() ?? null,
        })),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
        sentAt: entry.sentAt?.toISOString() ?? null,
        completedAt: entry.completedAt?.toISOString() ?? null,
        voidedAt: entry.voidedAt?.toISOString() ?? null,
        tokenExpiresAt: entry.tokenExpiresAt?.toISOString() ?? null,
        declinedReason: entry.declinedReason,
        voidReason: entry.voidReason,
        signedDocumentAvailable: Boolean(entry.signedCloudinaryId),
        completionCertificateAvailable: Boolean(entry.completionCertificateCloudinaryId),
      }))}
      auditLogs={auditLogs.map((log) => ({
        id: log.id,
        event: log.event,
        actor: log.actorEmail ?? "system",
        createdAt: log.createdAt.toISOString(),
        envelopeId: log.envelopeId,
      }))}
      summary={{
        completionRate:
          sentCount + completedCount > 0
            ? Math.round((completedCount / (sentCount + completedCount)) * 100)
            : 0,
        completedCount,
        sentCount,
        declinedCount,
        voidedCount,
        totalCount: envelopes.length,
      }}
    />
  );
}
