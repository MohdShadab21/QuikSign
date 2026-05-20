"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Download, Edit3, MoreHorizontal, Share2, Trash2 } from "lucide-react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/data-table";

export type DocumentTableRow = {
  id: string;
  fileName: string;
  signedDownloadUrl: string;
  createdAt: string;
  isSignedCopy: boolean;
  hasPlacedFields: boolean;
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

type DocumentsTableProps = {
  rows: DocumentTableRow[];
  onShare: (row: DocumentTableRow) => void;
  onDelete: (id: string) => void;
};

function RowActions({
  row,
  onShare,
  onDelete,
}: {
  row: DocumentTableRow;
  onShare: (row: DocumentTableRow) => void;
  onDelete: (id: string) => void;
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

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg hover:bg-surface"
        aria-label="Actions"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lg border border-border bg-surface py-1 shadow-lg">
          <Link
            href={`/sign-documents/${row.id}/edit`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-bg"
            onClick={() => setOpen(false)}
          >
            <Edit3 className="h-4 w-4 text-muted" aria-hidden />
            Edit
          </Link>
          <a
            href={row.signedDownloadUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-bg"
            onClick={() => setOpen(false)}
          >
            <Download className="h-4 w-4 text-muted" aria-hidden />
            Download
          </a>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-bg"
            onClick={() => {
              setOpen(false);
              onShare(row);
            }}
          >
            <Share2 className="h-4 w-4 text-muted" aria-hidden />
            Share
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/5"
            onClick={() => {
              setOpen(false);
              onDelete(row.id);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function DocumentsTable({ rows, onShare, onDelete }: DocumentsTableProps) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-body">
        No documents yet. Upload a PDF or Word file above to get started.
      </div>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <th className="px-4 py-3 text-left font-semibold">Document name</th>
          <th className="hidden px-4 py-3 text-left font-semibold sm:table-cell">Type</th>
          <th className="hidden px-4 py-3 text-left font-semibold md:table-cell">Fields</th>
          <th className="hidden px-4 py-3 text-left font-semibold lg:table-cell">Created on</th>
          <th className="w-12 px-4 py-3">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row) => (
          <DataTableRow
            key={row.id}
            className="cursor-pointer"
            onClick={() => router.push(`/sign-documents/${row.id}/edit`)}
          >
            <DataTableCell>
              <span className="font-medium text-text group-hover:text-primary">{row.fileName}</span>
              <div className="mt-1 flex flex-wrap items-center gap-2 sm:hidden">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                    row.isSignedCopy ? "bg-primary text-white" : "bg-muted/30 text-text"
                  }`}
                >
                  {row.isSignedCopy ? "Signed" : "Original"}
                </span>
                <span className="text-[10px] text-muted">{formatCreatedOn(row.createdAt)}</span>
              </div>
            </DataTableCell>
            <DataTableCell className="hidden sm:table-cell">
              <span
                className={`inline-block rounded px-2.5 py-1 text-[11px] font-bold uppercase ${
                  row.isSignedCopy ? "bg-primary text-white" : "bg-muted/30 text-text"
                }`}
              >
                {row.isSignedCopy ? "Signed" : "Original"}
              </span>
            </DataTableCell>
            <DataTableCell className="hidden text-sm text-body md:table-cell">
              {row.hasPlacedFields ? "Ready" : "Not placed"}
            </DataTableCell>
            <DataTableCell className="hidden whitespace-nowrap text-sm text-body lg:table-cell">
              {formatCreatedOn(row.createdAt)}
            </DataTableCell>
            <DataTableCell>
              <RowActions row={row} onShare={onShare} onDelete={onDelete} />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
