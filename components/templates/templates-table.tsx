"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Layers, MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/data-table";

export type TemplateTableRow = {
  id: string;
  name: string;
  description: string | null;
  documentName: string;
  roleCount: number;
  fieldCount: number;
  updatedAt: string;
};

function formatUpdated(iso: string): string {
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

type TemplatesTableProps = {
  rows: TemplateTableRow[];
  onDelete: (id: string) => void;
};

function RowActions({ row, onDelete }: { row: TemplateTableRow; onDelete: (id: string) => void }) {
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
        <div className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-border bg-surface py-1 shadow-lg">
          <Link
            href={`/send?templateId=${encodeURIComponent(row.id)}`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-bg"
            onClick={() => setOpen(false)}
          >
            <Send className="h-4 w-4 text-primary" aria-hidden />
            Use template
          </Link>
          <Link
            href={`/templates/${row.id}/edit`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-bg"
            onClick={() => setOpen(false)}
          >
            <Pencil className="h-4 w-4 text-muted" aria-hidden />
            Edit
          </Link>
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

export function TemplatesTable({ rows, onDelete }: TemplatesTableProps) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <Layers className="mx-auto h-10 w-10 text-muted" aria-hidden />
        <p className="mt-3 text-sm font-medium text-text">No templates yet</p>
        <p className="mt-1 text-xs text-muted">Create a template to reuse the same document layout.</p>
        <Link
          href="/templates/new"
          className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          Create template
        </Link>
      </div>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <th className="px-4 py-3 text-left font-semibold">Template name</th>
          <th className="hidden px-4 py-3 text-left font-semibold sm:table-cell">Document</th>
          <th className="hidden px-4 py-3 text-left font-semibold md:table-cell">Roles</th>
          <th className="hidden px-4 py-3 text-left font-semibold md:table-cell">Fields</th>
          <th className="hidden px-4 py-3 text-left font-semibold lg:table-cell">Updated</th>
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
            onClick={() => router.push(`/send?templateId=${encodeURIComponent(row.id)}`)}
          >
            <DataTableCell>
              <p className="font-medium text-text">{row.name}</p>
              {row.description ? (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted">{row.description}</p>
              ) : null}
              <p className="mt-0.5 truncate text-xs text-muted sm:hidden">{row.documentName}</p>
              <p className="mt-0.5 text-[10px] text-muted md:hidden">
                {row.roleCount} role{row.roleCount === 1 ? "" : "s"} · {row.fieldCount} field
                {row.fieldCount === 1 ? "" : "s"}
              </p>
            </DataTableCell>
            <DataTableCell className="hidden max-w-[200px] truncate text-sm text-body sm:table-cell">
              {row.documentName}
            </DataTableCell>
            <DataTableCell className="hidden text-sm text-body md:table-cell">{row.roleCount}</DataTableCell>
            <DataTableCell className="hidden text-sm text-body md:table-cell">{row.fieldCount}</DataTableCell>
            <DataTableCell className="hidden whitespace-nowrap text-sm text-body lg:table-cell">
              {formatUpdated(row.updatedAt)}
            </DataTableCell>
            <DataTableCell>
              <RowActions row={row} onDelete={onDelete} />
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
