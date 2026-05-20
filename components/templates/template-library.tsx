"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Layers, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTableShell, TablePagination } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { useToast } from "@/components/ui/toast-provider";
import { TemplatesTable, type TemplateTableRow } from "@/components/templates/templates-table";

export function TemplateLibrary({
  templates,
}: {
  templates: Array<{
    id: string;
    name: string;
    description: string | null;
    documentId: string;
    document: { id: string; fileName: string } | null;
    signers: Array<{ roleName: string; role: "SIGNER" | "APPROVER" | "CC"; signingOrder: number }>;
    fields: Array<{ page: number }>;
    updatedAt: string;
  }>;
}) {
  const { pushToast } = useToast();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const rows = useMemo<TemplateTableRow[]>(() => {
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      documentName: t.document?.fileName ?? "Document",
      roleCount: t.signers.length,
      fieldCount: t.fields.length,
      updatedAt: t.updatedAt,
    }));
  }, [templates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.documentName.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const deleteTemplate = async (id: string) => {
    if (!window.confirm("Delete this template? This cannot be undone.")) return;
    try {
      const response = await fetch(`/api/templates/${id}`, { method: "DELETE", headers: withJsonHeaders() });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ? String(data.error) : "Delete failed"));
      }
      pushToast("Template deleted.", "success");
      window.location.reload();
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    }
  };

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-label uppercase">Templates</p>
          <p className="mt-1 max-w-xl text-sm text-body">
            Save a document layout once, then send it many times to different people. Each send fills in real recipient
            emails while keeping your field placements.
          </p>
        </div>
        <Link href="/templates/new" className="shrink-0">
          <Button variant="primary" className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Create template
          </Button>
        </Link>
      </div>

      <DataTableShell
        footer={
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        }
      >
        <div className="border-b border-border bg-bg/50 px-4 py-3">
          <p className={clsx("mb-3 text-xs text-muted", filtered.length === 0 && "hidden")}>
            {filtered.length} template{filtered.length === 1 ? "" : "s"}
          </p>
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search templates..."
              className="pl-9"
            />
          </div>
        </div>
        <TemplatesTable rows={paginated} onDelete={deleteTemplate} />
      </DataTableShell>

      {templates.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Layers className="h-4 w-4 shrink-0" aria-hidden />
          Tip: build a template after you have a PDF in Documents — same file, reusable roles and fields.
        </p>
      ) : null}
    </div>
  );
}
