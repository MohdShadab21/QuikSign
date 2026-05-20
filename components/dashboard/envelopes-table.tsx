"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Bell, Ban, MoreHorizontal, Package } from "lucide-react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/data-table";
import { envelopeStatusBadgeClass, envelopeStatusLabel } from "@/lib/ui/envelope-status";

export type EnvelopeTableRow = {
  id: string;
  title: string;
  documentFileName: string | null;
  status: string;
  signers: Array<{ name: string; email: string; role: string; status: string }>;
  createdAt: string;
  sentAt: string | null;
  signedDocumentAvailable: boolean;
};

function formatCreatedOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function recipientSummary(signers: EnvelopeTableRow["signers"]): { display: string; title: string } {
  const recipients = signers.filter((s) => s.role !== "CC");
  if (recipients.length === 0) return { display: "—", title: "" };
  const emails = recipients.map((s) => s.email);
  if (emails.length === 1) return { display: emails[0]!, title: emails[0]! };
  return {
    display: `${emails[0]} +${emails.length - 1}`,
    title: emails.join(", "),
  };
}

type EnvelopesTableProps = {
  rows: EnvelopeTableRow[];
  pendingAction: string | null;
  onRemind: (id: string) => void;
  onVoid: (id: string) => void;
  onDownloadSigned: (id: string) => void;
  onDownloadPacket: (id: string) => void;
};

function RowActionsMenu({
  row,
  pendingAction,
  onRemind,
  onVoid,
  onDownloadSigned,
  onDownloadPacket,
}: {
  row: EnvelopeTableRow;
  pendingAction: string | null;
  onRemind: (id: string) => void;
  onVoid: (id: string) => void;
  onDownloadSigned: (id: string) => void;
  onDownloadPacket: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const busy = (key: string) => pendingAction === key;

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg text-text hover:bg-surface"
        aria-label="Actions"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-border bg-surface py-1 shadow-lg">
          <Link
            href={`/envelopes/${row.id}`}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
            onClick={() => setOpen(false)}
          >
            <ExternalLink className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            Open
          </Link>
          {row.status === "SENT" ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg disabled:opacity-50"
              disabled={busy(`remind-${row.id}`)}
              onClick={() => {
                setOpen(false);
                onRemind(row.id);
              }}
            >
              <Bell className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              {busy(`remind-${row.id}`) ? "Sending…" : "Remind"}
            </button>
          ) : null}
          {row.status === "COMPLETED" && row.signedDocumentAvailable ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg disabled:opacity-50"
              disabled={busy(`signed-${row.id}`)}
              onClick={() => {
                setOpen(false);
                onDownloadSigned(row.id);
              }}
            >
              <Download className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              {busy(`signed-${row.id}`) ? "Opening…" : "Signed PDF"}
            </button>
          ) : null}
          {row.status === "COMPLETED" ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg disabled:opacity-50"
              disabled={busy(`packet-${row.id}`)}
              onClick={() => {
                setOpen(false);
                onDownloadPacket(row.id);
              }}
            >
              <Package className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              {busy(`packet-${row.id}`) ? "Downloading…" : "Packet ZIP"}
            </button>
          ) : null}
          {row.status === "SENT" || row.status === "DECLINED" ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/5 disabled:opacity-50"
              disabled={busy(`void-${row.id}`)}
              onClick={() => {
                setOpen(false);
                onVoid(row.id);
              }}
            >
              <Ban className="h-4 w-4 shrink-0" aria-hidden />
              {busy(`void-${row.id}`) ? "Voiding…" : "Void"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function EnvelopesTable({
  rows,
  pendingAction,
  onRemind,
  onVoid,
  onDownloadSigned,
  onDownloadPacket,
}: EnvelopesTableProps) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-sm font-medium text-text">No envelopes match your filters</p>
        <p className="mt-1 text-xs text-muted">Try another status or clear the search box.</p>
      </div>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <th className="px-4 py-3 text-left font-semibold">Document name</th>
          <th className="hidden px-4 py-3 text-left font-semibold sm:table-cell">Recipient email</th>
          <th className="px-4 py-3 text-left font-semibold">Status</th>
          <th className="hidden px-4 py-3 text-left font-semibold md:table-cell">Created on</th>
          <th className="w-12 px-4 py-3">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row) => {
          const signedCount = row.signers.filter((s) => s.status === "SIGNED" && s.role !== "CC").length;
          const totalSigners = row.signers.filter((s) => s.role !== "CC").length;
          const recipients = recipientSummary(row.signers);
          return (
            <DataTableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => router.push(`/envelopes/${row.id}`)}
            >
              <DataTableCell>
                <div className="group block min-w-0">
                  <p className="truncate font-medium text-text group-hover:text-primary">{row.title}</p>
                  {row.documentFileName ? (
                    <p className="truncate text-xs text-muted">{row.documentFileName}</p>
                  ) : null}
                  <p className="mt-0.5 truncate text-xs text-body sm:hidden" title={recipients.title}>
                    {recipients.display}
                  </p>
                  {totalSigners > 0 ? (
                    <p className="mt-0.5 text-xs text-muted">
                      {signedCount}/{totalSigners} signed
                    </p>
                  ) : null}
                </div>
              </DataTableCell>
              <DataTableCell className="hidden sm:table-cell">
                <span className="block max-w-[220px] truncate text-sm text-body" title={recipients.title}>
                  {recipients.display}
                </span>
              </DataTableCell>
              <DataTableCell>
                <span
                  className={`inline-block rounded px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${envelopeStatusBadgeClass(row.status)}`}
                >
                  {envelopeStatusLabel(row.status)}
                </span>
                <p className="mt-1 text-[10px] text-muted md:hidden">
                  {formatCreatedOn(row.sentAt ?? row.createdAt)}
                </p>
              </DataTableCell>
              <DataTableCell className="hidden whitespace-nowrap text-sm text-body md:table-cell">
                {formatCreatedOn(row.sentAt ?? row.createdAt)}
              </DataTableCell>
              <DataTableCell>
                <RowActionsMenu
                  row={row}
                  pendingAction={pendingAction}
                  onRemind={onRemind}
                  onVoid={onVoid}
                  onDownloadSigned={onDownloadSigned}
                  onDownloadPacket={onDownloadPacket}
                />
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}
