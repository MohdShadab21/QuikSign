"use client";

import {
  Activity,
  CheckCircle2,
  Eye,
  Mail,
  PlusCircle,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ReactNode } from "react";

export type ActivityEntry = {
  id: string;
  event: string;
  actor: string;
  createdAt: string;
  envelopeId: string | null;
};

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.round(diff / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function eventIcon(event: string): ReactNode {
  const lower = event.toLowerCase();
  const cls = "h-4 w-4 shrink-0";
  if (lower.includes("signed") || lower.includes("approved")) {
    return <CheckCircle2 className={`${cls} text-success`} aria-hidden />;
  }
  if (lower.includes("declined") || lower.includes("voided")) {
    return <XCircle className={`${cls} text-danger`} aria-hidden />;
  }
  if (lower.includes("viewed")) {
    return <Eye className={`${cls} text-primary`} aria-hidden />;
  }
  if (lower.includes("remind") || lower.includes("sent")) {
    return <Mail className={`${cls} text-primary`} aria-hidden />;
  }
  if (lower.includes("created")) {
    return <PlusCircle className={`${cls} text-muted`} aria-hidden />;
  }
  return <Activity className={`${cls} text-muted`} aria-hidden />;
}

type ActivityFeedProps = {
  auditLogs: ActivityEntry[];
  onViewEnvelope?: (envelopeId: string) => void;
};

export function ActivityFeed({ auditLogs, onViewEnvelope }: ActivityFeedProps) {
  const items = auditLogs.slice(0, 15);
  const today = new Date();
  const todayKey = today.toDateString();
  const yesterday = new Date(today.getTime() - 86400000).toDateString();

  const groups: Record<string, ActivityEntry[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const item of items) {
    const key = new Date(item.createdAt).toDateString();
    if (key === todayKey) groups.Today!.push(item);
    else if (key === yesterday) groups.Yesterday!.push(item);
    else groups.Earlier!.push(item);
  }

  return (
    <Card padding="md" className="min-w-0">
      <h3 className="text-heading text-lg">Recent activity</h3>
      <p className="mt-0.5 text-sm text-body">Latest events across your envelopes.</p>
      <div className="mt-4 space-y-4">
        {auditLogs.length === 0 ? (
          <p className="text-sm text-body">No activity yet.</p>
        ) : (
          (["Today", "Yesterday", "Earlier"] as const).map((group) => {
            const entries = groups[group];
            if (!entries?.length) return null;
            return (
              <div key={group}>
                <p className="text-label">{group}</p>
                <ul className="mt-2 space-y-2">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm transition hover:border-primary/30 hover:bg-primary/5"
                    >
                      {eventIcon(entry.event)}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-text">{entry.event}</p>
                        <p className="text-xs text-muted">
                          {entry.actor} · {formatRelative(entry.createdAt)}
                        </p>
                        {entry.envelopeId && onViewEnvelope ? (
                          <button
                            type="button"
                            onClick={() => onViewEnvelope(entry.envelopeId!)}
                            className="mt-1 text-xs font-medium text-primary hover:underline"
                          >
                            View envelope
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
