"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { appAuthHeaders, withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  const minutes = Math.round(diff / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function badgeClasses(status: string): string {
  if (status === "COMPLETED") return "bg-success/10 text-success";
  if (status === "DECLINED" || status === "VOIDED") return "bg-danger/10 text-danger";
  if (status === "SENT") return "bg-warning/10 text-warning";
  if (status === "EXPIRED") return "bg-danger/10 text-danger";
  if (status === "DRAFT") return "bg-muted/10 text-muted";
  return "bg-muted/10 text-muted";
}

function signerBadgeClasses(status: string): string {
  if (status === "SIGNED") return "bg-success/10 text-success";
  if (status === "DECLINED") return "bg-danger/10 text-danger";
  if (status === "VIEWED") return "bg-primary/10 text-primary";
  return "bg-muted/10 text-muted";
}

function eventIcon(event: string) {
  const lower = event.toLowerCase();
  const common = "h-4 w-4";
  if (lower.includes("signed") || lower.includes("approved")) {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M20 7L10 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (lower.includes("declined") || lower.includes("voided")) {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (lower.includes("viewed")) {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="2" />
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (lower.includes("reminded") || lower.includes("sent")) {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 11l18-8-8 18-2-8-8-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DashboardClient({ envelopes, auditLogs, summary }: DashboardClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusChip>("ALL");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");
  const [dateRange, setDateRange] = useState<"ALL" | "7D" | "30D" | "90D">("ALL");
  const [nowTs] = useState(() => Date.now());
  const [expandedEnvelopeId, setExpandedEnvelopeId] = useState<string | null>(null);
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

  const pendingCount = useMemo(() => envelopes.filter((e) => e.status === "SENT").length, [envelopes]);

  const attentionItems = useMemo(() => {
    const items: Array<{ id: string; title: string; status: string; statusLabel: string }> = [];
    for (const env of envelopes) {
      if (items.length >= 5) break;
      if (env.status === "SENT") {
        items.push({ id: env.id, title: env.title, status: "SENT", statusLabel: "Awaiting signatures" });
      } else if (env.status === "DECLINED") {
        items.push({ id: env.id, title: env.title, status: "DECLINED", statusLabel: "Declined by signer" });
      } else if (env.status === "VOIDED") {
        items.push({ id: env.id, title: env.title, status: "VOIDED", statusLabel: "Voided" });
      }
    }
    return items;
  }, [envelopes]);

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

  const recentActivityGroups = useMemo(() => {
    const items = auditLogs.slice(0, 12);
    const today = new Date();
    const todayKey = today.toDateString();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toDateString();

    const groups: Record<string, DashboardAudit[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const item of items) {
      const key = new Date(item.createdAt).toDateString();
      if (key === todayKey) groups.Today!.push(item);
      else if (key === yesterday) groups.Yesterday!.push(item);
      else groups.Earlier!.push(item);
    }
    return groups;
  }, [auditLogs]);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-label uppercase tracking-wide">Start Here</p>
            <h2 className="mt-1 text-heading text-2xl">Send your next document</h2>
            <p className="mt-1 text-body text-sm">
              You have <span className="font-semibold text-text">{pendingCount}</span> envelopes awaiting signatures.
              {summary.declinedCount > 0 ? ` ${summary.declinedCount} declined.` : ""}
              {summary.voidedCount > 0 ? ` ${summary.voidedCount} voided.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/send">
              <Button variant="primary" className="px-5">
                Send Document
              </Button>
            </Link>
            <Link href="/upload">
              <Button variant="secondary">Upload Document</Button>
            </Link>
            <Button variant="secondary" onClick={refresh}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-heading text-lg">Needs Your Attention</h3>
            <p className="text-body text-sm">Items that need a quick decision or follow-up.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {attentionItems.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm text-body">
              You&apos;re all caught up. Nothing needs attention right now.
            </div>
          ) : (
            attentionItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold text-text">{item.title}</p>
                  <p className="mt-0.5 text-sm text-body">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClasses(item.status)}`}>
                      {item.status}
                    </span>
                    {item.statusLabel}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setExpandedEnvelopeId(item.id)}
                  >
                    Details
                  </Button>
                  {item.status === "SENT" ? (
                    <Button
                      size="sm"
                      onClick={() => void remindEnvelope(item.id)}
                      disabled={pendingAction === `remind-${item.id}`}
                    >
                      {pendingAction === `remind-${item.id}` ? "Sending…" : "Remind"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <button
          type="button"
          onClick={() => setStatusFilter("ALL")}
          className="text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Card className="p-6">
            <p className="text-label uppercase">Completion Rate</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-primary">{summary.completionRate}%</span>
              <span className="text-sm text-body">of sent</span>
            </p>
            <p className="mt-2 text-sm text-body">Across {summary.totalCount} envelopes.</p>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("COMPLETED")}
          className="text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Card className="p-6">
            <p className="text-label uppercase">Completed</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-success">{summary.completedCount}</span>
              <span className="text-sm text-body">envelopes</span>
            </p>
            <p className="mt-2 text-sm text-body">Signed by all recipients.</p>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("SENT")}
          className="text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Card className="p-6">
            <p className="text-label uppercase">In progress</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-warning">{summary.sentCount}</span>
              <span className="text-sm text-body">active</span>
            </p>
            <p className="mt-2 text-sm text-body">Sent, awaiting signers.</p>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("DECLINED")}
          className="text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Card className="p-6">
            <p className="text-label uppercase">Declined / Voided</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-danger">
                {summary.declinedCount + summary.voidedCount}
              </span>
              <span className="text-sm text-body">total</span>
            </p>
            <p className="mt-2 text-sm text-body">
              {summary.declinedCount} declined · {summary.voidedCount} voided
            </p>
          </Card>
        </button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, status, signer email or name…"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["ALL", "SENT", "COMPLETED", "DECLINED", "VOIDED"] as StatusChip[]).map((chip) => {
                const active = statusFilter === chip;
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setStatusFilter(chip)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-surface text-text hover:bg-surface/95"
                    }`}
                  >
                    {chip === "ALL"
                      ? "All"
                      : chip === "SENT"
                        ? "Pending"
                        : chip === "COMPLETED"
                          ? "Completed"
                          : chip === "DECLINED"
                            ? "Declined"
                            : "Voided"}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Sort: Oldest</option>
              <option value="title">Sort: Title</option>
            </select>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="ALL">All time</option>
              <option value="7D">Last 7d</option>
              <option value="30D">Last 30d</option>
              <option value="90D">Last 90d</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-heading text-lg">Recent Envelopes</h3>
              <p className="text-body text-sm">Your most recent workflows and quick actions.</p>
            </div>
            <Link href="/send" className="hidden md:block">
              <Button size="sm" variant="primary">
                New envelope
              </Button>
            </Link>
          </div>

          <div className="mt-4 grid gap-3">
            {filteredEnvelopes.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-6 text-sm text-body">
                No envelopes match your filters.
              </div>
            ) : (
              filteredEnvelopes.slice(0, 12).map((env) => {
                const expanded = expandedEnvelopeId === env.id;
                const signedCount = env.signers.filter((s) => s.status === "SIGNED").length;
                const totalSigners = env.signers.filter((s) => s.role !== "CC").length;
                return (
                  <div
                    key={env.id}
                    className="rounded-xl border border-border bg-surface p-4 transition hover:bg-surface/95"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold text-text">{env.title}</p>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClasses(env.status)}`}>
                            {env.status}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-body">
                          {env.documentFileName ? <span className="text-muted">{env.documentFileName} · </span> : null}
                          {signedCount}/{totalSigners} signed
                          {env.sentAt ? ` · Sent ${formatRelative(env.sentAt)}` : ` · Updated ${formatRelative(env.updatedAt)}`}
                          {env.completedAt ? ` · Completed ${formatRelative(env.completedAt)}` : ""}
                        </p>
                        {env.declinedReason && env.status === "DECLINED" ? (
                          <p className="mt-1 text-xs text-danger">Decline reason: {env.declinedReason}</p>
                        ) : null}
                        {env.voidReason && env.status === "VOIDED" ? (
                          <p className="mt-1 text-xs text-danger">Void reason: {env.voidReason}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setExpandedEnvelopeId(expanded ? null : env.id)}>
                          {expanded ? "Hide" : "Details"}
                        </Button>
                        <Link href={`/envelopes/${env.id}`}>
                          <Button size="sm" variant="secondary">
                            Open document
                          </Button>
                        </Link>
                        {env.status === "COMPLETED" && env.signedDocumentAvailable ? (
                          <Button
                            size="sm"
                            onClick={() => void downloadSignedPdf(env.id)}
                            disabled={pendingAction === `signed-${env.id}`}
                          >
                            {pendingAction === `signed-${env.id}` ? "Opening…" : "Signed PDF"}
                          </Button>
                        ) : null}
                        {env.status === "COMPLETED" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void downloadPacket(env.id)}
                            disabled={pendingAction === `packet-${env.id}`}
                          >
                            {pendingAction === `packet-${env.id}` ? "Downloading…" : "Packet ZIP"}
                          </Button>
                        ) : null}
                        {env.status === "SENT" ? (
                          <Button
                            size="sm"
                            onClick={() => void remindEnvelope(env.id)}
                            disabled={pendingAction === `remind-${env.id}`}
                          >
                            {pendingAction === `remind-${env.id}` ? "Sending…" : "Remind"}
                          </Button>
                        ) : null}
                        {env.status === "SENT" || env.status === "DECLINED" ? (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => void voidEnvelope(env.id)}
                            disabled={pendingAction === `void-${env.id}`}
                          >
                            {pendingAction === `void-${env.id}` ? "Voiding…" : "Void"}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {expanded ? (
                      <div className="mt-4 grid gap-3 rounded-lg border border-border bg-bg p-3 text-xs">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <p className="text-muted">Sent</p>
                            <p className="text-text">{formatDate(env.sentAt ?? env.createdAt)}</p>
                          </div>
                          <div>
                            <p className="text-muted">Token expires</p>
                            <p className="text-text">{formatDate(env.tokenExpiresAt)}</p>
                          </div>
                          {env.completedAt ? (
                            <div>
                              <p className="text-muted">Completed</p>
                              <p className="text-text">{formatDate(env.completedAt)}</p>
                            </div>
                          ) : null}
                          {env.voidedAt ? (
                            <div>
                              <p className="text-muted">Voided</p>
                              <p className="text-text">{formatDate(env.voidedAt)}</p>
                            </div>
                          ) : null}
                        </div>
                        <div>
                          <p className="text-muted">Recipients</p>
                          <div className="mt-1 space-y-1">
                            {env.signers
                              .slice()
                              .sort((a, b) => a.signingOrder - b.signingOrder)
                              .map((signer) => (
                                <div
                                  key={signer.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-text">
                                      <span className="font-medium">{signer.name}</span>{" "}
                                      <span className="text-muted">&lt;{signer.email}&gt;</span>
                                    </p>
                                    <p className="text-[10px] text-muted">
                                      Order {signer.signingOrder} · {signer.role}
                                      {signer.signedAt ? ` · Signed ${formatRelative(signer.signedAt)}` : ""}
                                      {signer.declinedAt ? ` · Declined ${formatRelative(signer.declinedAt)}` : ""}
                                      {signer.viewedAt && !signer.signedAt && !signer.declinedAt
                                        ? ` · Viewed ${formatRelative(signer.viewedAt)}`
                                        : ""}
                                    </p>
                                  </div>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${signerBadgeClasses(signer.status)}`}
                                  >
                                    {signer.status}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-heading text-lg">Recent Activity</h3>
              <p className="text-body text-sm">What just happened across your envelopes.</p>
            </div>
          </div>

          <div className="mt-4 space-y-5">
            {auditLogs.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-4 text-sm text-body">No activity yet.</div>
            ) : (
              (["Today", "Yesterday", "Earlier"] as const).map((group) => {
                const entries = recentActivityGroups[group];
                if (!entries || entries.length === 0) return null;
                return (
                  <div key={group}>
                    <p className="text-label uppercase">{group}</p>
                    <div className="mt-2 space-y-2">
                      {entries.map((entry) => (
                        <div key={entry.id} className="flex gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
                          <div className="mt-0.5 text-primary">{eventIcon(entry.event)}</div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-text">{entry.event}</p>
                            <p className="mt-0.5 text-xs text-body">
                              {entry.actor} · {formatRelative(entry.createdAt)}
                            </p>
                            {entry.envelopeId ? (
                              <button
                                type="button"
                                onClick={() => setExpandedEnvelopeId(entry.envelopeId)}
                                className="mt-1 inline-block text-xs text-primary hover:underline"
                              >
                                View envelope
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
