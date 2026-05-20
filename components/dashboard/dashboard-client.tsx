"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Search } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import { appAuthHeaders, withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { EnvelopesTable } from "@/components/dashboard/envelopes-table";
import { DataTableShell, TablePagination } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";

type DashboardSigner = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  signingOrder: number;
  signedAt: string | null;
  declinedAt: string | null;
  viewedAt: string | null;
};

type DashboardEnvelope = {
  id: string;
  title: string;
  documentFileName: string | null;
  status: string;
  signers: DashboardSigner[];
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  completedAt: string | null;
  voidedAt: string | null;
  tokenExpiresAt: string | null;
  declinedReason: string | null;
  voidReason: string | null;
  signedDocumentAvailable: boolean;
  completionCertificateAvailable: boolean;
};

type DashboardAudit = {
  id: string;
  event: string;
  actor: string;
  createdAt: string;
  envelopeId: string | null;
};

type DashboardClientProps = {
  envelopes: DashboardEnvelope[];
  auditLogs: DashboardAudit[];
  summary: {
    completionRate: number;
    completedCount: number;
    sentCount: number;
    declinedCount: number;
    voidedCount: number;
    totalCount: number;
  };
};

type StatusChip = "ALL" | "SENT" | "COMPLETED" | "DECLINED" | "VOIDED";

export function DashboardClient({ envelopes, auditLogs, summary }: DashboardClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusChip>("ALL");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");
  const [dateRange, setDateRange] = useState<"ALL" | "7D" | "30D" | "90D">("ALL");
  const [nowTs] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { pushToast } = useToast();

  const refresh = () => startTransition(() => router.refresh());

  const thresholdMs = useMemo(() => {
    if (dateRange === "7D") return nowTs - 7 * 24 * 60 * 60 * 1000;
    if (dateRange === "30D") return nowTs - 30 * 24 * 60 * 60 * 1000;
    if (dateRange === "90D") return nowTs - 90 * 24 * 60 * 60 * 1000;
    return null;
  }, [dateRange, nowTs]);

  const filteredEnvelopes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const base = envelopes.filter((entry) => {
      const matchesStatus = statusFilter === "ALL" ? true : entry.status === statusFilter;
      const matchesDate = thresholdMs === null ? true : new Date(entry.updatedAt).getTime() >= thresholdMs;
      const matchesQuery =
        normalizedQuery.length === 0
          ? true
          : entry.title.toLowerCase().includes(normalizedQuery) ||
            entry.status.toLowerCase().includes(normalizedQuery) ||
            entry.id.toLowerCase().includes(normalizedQuery) ||
            entry.signers.some(
              (signer) =>
                signer.email.toLowerCase().includes(normalizedQuery) ||
                signer.name.toLowerCase().includes(normalizedQuery),
            );
      return matchesStatus && matchesQuery && matchesDate;
    });

    return base.sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "oldest") return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [envelopes, query, sortBy, statusFilter, thresholdMs]);

  const paginatedEnvelopes = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredEnvelopes.slice(start, start + pageSize);
  }, [filteredEnvelopes, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, sortBy, dateRange]);

  const downloadPacket = async (envelopeId: string) => {
    setPendingAction(`packet-${envelopeId}`);
    try {
      const response = await fetch(`/api/envelopes/${envelopeId}/packet`, { method: "GET", headers: appAuthHeaders() });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(mapApiErrorMessage(data.error ?? "Packet download failed"));
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `envelope-${envelopeId}-packet.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
      pushToast("Packet downloaded.", "success");
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const downloadSignedPdf = async (envelopeId: string) => {
    setPendingAction(`signed-${envelopeId}`);
    try {
      const response = await fetch(`/api/envelopes/${envelopeId}`, { method: "GET", headers: appAuthHeaders() });
      if (!response.ok) throw new Error("Signed PDF is not available yet.");
      const data = (await response.json()) as { signedDocumentDownloadUrl?: string };
      if (!data.signedDocumentDownloadUrl) throw new Error("Signed PDF is not available yet.");
      window.open(data.signedDocumentDownloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const remindEnvelope = async (envelopeId: string) => {
    setPendingAction(`remind-${envelopeId}`);
    try {
      const response = await fetch(`/api/envelopes/${envelopeId}/remind`, {
        method: "POST",
        headers: withJsonHeaders(),
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!response.ok) throw new Error(mapApiErrorMessage(data.error ?? "Remind failed"));
      pushToast("Reminder email sent.", "success");
      refresh();
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const voidEnvelope = async (envelopeId: string) => {
    const reason = window.prompt("Reason for voiding this envelope (visible to recipients):", "Voided by sender");
    if (reason === null) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      pushToast("Please provide a void reason of at least 3 characters.", "error");
      return;
    }
    setPendingAction(`void-${envelopeId}`);
    try {
      const response = await fetch(`/api/envelopes/${envelopeId}/void`, {
        method: "POST",
        headers: withJsonHeaders(),
        body: JSON.stringify({ reason: trimmed }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(mapApiErrorMessage(data.error ?? "Void failed"));
      pushToast("Envelope voided. Recipients notified.", "success");
      refresh();
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const statCards = [
    { filter: "ALL" as StatusChip, label: "Total", value: summary.totalCount, valueClass: "text-text" },
    { filter: "SENT" as StatusChip, label: "In progress", value: summary.sentCount, valueClass: "text-warning" },
    { filter: "COMPLETED" as StatusChip, label: "Completed", value: summary.completedCount, valueClass: "text-success" },
    {
      filter: "DECLINED" as StatusChip,
      label: "Declined / voided",
      value: summary.declinedCount + summary.voidedCount,
      valueClass: "text-danger",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const active = statusFilter === card.filter;
          return (
            <button
              key={card.filter}
              type="button"
              onClick={() => setStatusFilter(card.filter)}
              className={clsx(
                "rounded-xl border px-4 py-3 text-left transition-all duration-200",
                "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/25"
                  : "border-border bg-surface shadow-sm hover:border-primary/40",
              )}
              aria-pressed={active}
            >
              <p className="text-label">{card.label}</p>
              <p className={clsx("mt-1 text-2xl font-semibold tabular-nums", card.valueClass)}>{card.value}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <DataTableShell
          footer={
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={filteredEnvelopes.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          }
        >
          <div className="border-b border-border bg-bg/50 px-4 py-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                {filteredEnvelopes.length} result{filteredEnvelopes.length === 1 ? "" : "s"}
                {statusFilter !== "ALL" ? ` (${statusFilter.toLowerCase()})` : ""}
              </span>
              {summary.completionRate > 0 ? (
                <span>{summary.completionRate}% completed (of sent)</span>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search document, recipient, or status..."
                  className="mt-0 pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(["ALL", "SENT", "COMPLETED", "DECLINED", "VOIDED"] as StatusChip[]).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setStatusFilter(chip)}
                    className={clsx(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150",
                      statusFilter === chip
                        ? "border-primary bg-primary text-white shadow-sm"
                        : "border-border bg-surface text-text hover:border-primary/40 hover:bg-primary/5",
                    )}
                  >
                    {chip === "ALL"
                      ? "All"
                      : chip === "SENT"
                        ? "Sent"
                        : chip === "COMPLETED"
                          ? "Completed"
                          : chip === "DECLINED"
                            ? "Declined"
                            : "Voided"}
                  </button>
                ))}
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A-Z</option>
              </select>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
              >
                <option value="ALL">All time</option>
                <option value="7D">Last 7 days</option>
                <option value="30D">Last 30 days</option>
                <option value="90D">Last 90 days</option>
              </select>
            </div>
          </div>
          <EnvelopesTable
            rows={paginatedEnvelopes}
            pendingAction={pendingAction}
            onRemind={remindEnvelope}
            onVoid={voidEnvelope}
            onDownloadSigned={downloadSignedPdf}
            onDownloadPacket={downloadPacket}
          />
        </DataTableShell>

        <ActivityFeed
          auditLogs={auditLogs}
          onViewEnvelope={(id) => router.push(`/envelopes/${id}`)}
        />
      </div>
    </div>
  );
}
