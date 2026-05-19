import { prisma } from "@/db/prisma";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getRequestUser } from "@/lib/auth/request-user";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getRequestUser().catch(() => null);

  const envelopeWhere: Prisma.EnvelopeWhereInput = user
    ? user.orgId
      ? { orgId: user.orgId }
      : { createdByEmail: user.userEmail.toLowerCase() }
    : {};

  const auditWhere: Prisma.AuditLogWhereInput = user
    ? user.orgId
      ? { envelope: { orgId: user.orgId } }
      : { actorEmail: user.userEmail.toLowerCase() }
    : {};

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
  const completionDenominator = envelopes.filter((entry) => entry.status !== "DRAFT").length;
  const completionRate = completionDenominator
    ? Math.round((completedCount / completionDenominator) * 100)
    : 0;

  const dashboardEnvelopes = envelopes.map((entry) => ({
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
      signedAt: signer.signedAt ? signer.signedAt.toISOString() : null,
      declinedAt: signer.declinedAt ? signer.declinedAt.toISOString() : null,
      viewedAt: signer.viewedAt ? signer.viewedAt.toISOString() : null,
    })),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    sentAt: entry.sentAt ? entry.sentAt.toISOString() : null,
    completedAt: entry.completedAt ? entry.completedAt.toISOString() : null,
    voidedAt: entry.voidedAt ? entry.voidedAt.toISOString() : null,
    tokenExpiresAt: entry.tokenExpiresAt ? entry.tokenExpiresAt.toISOString() : null,
    declinedReason: entry.declinedReason ?? null,
    voidReason: entry.voidReason ?? null,
    signedDocumentAvailable: Boolean(entry.signedCloudinaryId),
    completionCertificateAvailable: Boolean(entry.completionCertificateCloudinaryId),
  }));
  const dashboardAuditLogs = auditLogs.map((entry) => ({
    id: entry.id,
    event: entry.event,
    actor: entry.actorEmail ?? entry.actorUserId ?? "system",
    createdAt: entry.createdAt.toISOString(),
    envelopeId: entry.envelopeId ?? null,
  }));

  return (
    <DashboardClient
      envelopes={dashboardEnvelopes}
      auditLogs={dashboardAuditLogs}
      summary={{
        completionRate,
        completedCount,
        sentCount,
        declinedCount,
        voidedCount,
        totalCount: envelopes.length,
      }}
    />
  );
}
