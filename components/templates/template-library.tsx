"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { useToast } from "@/components/ui/toast-provider";
import { PageHeader } from "@/components/ui/page-header";

type TemplateRole = { roleName: string; role: "SIGNER" | "APPROVER" | "CC"; signingOrder: number };

type TemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  documentId: string;
  documentName: string;
  updatedAt: string;
  roles: TemplateRole[];
  fields: Array<{ page: number }>;
};

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

function TemplatePreviewDrawer({
  template,
  onClose,
  onUse,
  onEdit,
}: {
  template: TemplateSummary;
  onClose: () => void;
  onUse: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-heading text-xl">{template.name}</h3>
            <p className="mt-1 text-body text-sm">{template.description || "No description"}</p>
            <p className="mt-2 text-sm text-muted">Document: {template.documentName}</p>
            <p className="mt-1 text-sm text-muted">Updated {formatRelative(template.updatedAt)}</p>
          </div>
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-5">
          <p className="text-label uppercase">Roles (in order)</p>
          <div className="mt-2 space-y-2">
            {template.roles
              .slice()
              .sort((a, b) => a.signingOrder - b.signingOrder)
              .map((role) => (
                <div
                  key={`${role.roleName}-${role.signingOrder}`}
                  className="rounded-xl border border-border bg-bg p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-text">
                      {role.signingOrder}. {role.roleName}
                    </p>
                    <span className="rounded-full bg-surface px-2 py-1 text-xs font-semibold text-muted">
                      {role.role}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-border bg-bg p-4">
          <p className="text-label uppercase">Field placement</p>
          <p className="mt-1 text-body text-sm">
            {template.fields.length} field(s) across {new Set(template.fields.map((f) => f.page)).size || 1} page(s).
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={onUse}>
            Use Template
          </Button>
          <Button className="flex-1" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

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
  const [selected, setSelected] = useState<TemplateSummary | null>(null);

  const normalizedTemplates = useMemo<TemplateSummary[]>(() => {
    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      documentId: t.documentId,
      documentName: t.document?.fileName ?? "Document",
      updatedAt: t.updatedAt,
      roles: t.signers.map((s) => ({ roleName: s.roleName, role: s.role, signingOrder: s.signingOrder })),
      fields: t.fields,
    }));
  }, [templates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalizedTemplates;
    return normalizedTemplates.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q),
    );
  }, [normalizedTemplates, query]);

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
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Reusable workflows for sending documents."
        actions={
          <Link href="/templates/new">
            <Button variant="primary">Create template</Button>
          </Link>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates…" />
          </div>
          <p className="text-sm text-muted">{filtered.length} template(s)</p>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <h3 className="text-heading text-lg">No templates yet</h3>
          <p className="mt-1 text-body text-sm">Create your first reusable workflow template.</p>
          <div className="mt-4">
            <Link href="/templates/new">
              <Button variant="primary">Create Template</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="group cursor-pointer rounded-2xl transition hover:-translate-y-0.5"
              onClick={() => setSelected(t)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setSelected(t);
              }}
            >
              <Card className="h-full p-5 transition group-hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-text">{t.name}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-body">{t.description || "No description"}</p>
                  </div>
                  <span className="rounded-full bg-bg px-2 py-1 text-xs font-semibold text-muted">
                    {t.roles.length} role(s)
                  </span>
                </div>
                <div className="mt-4 space-y-1 text-sm text-muted">
                  <p className="truncate">Document: {t.documentName}</p>
                  <p>Updated {formatRelative(t.updatedAt)}</p>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={`/send?templateId=${encodeURIComponent(t.id)}`} onClick={(e) => e.stopPropagation()}>
                    <Button variant="primary" size="sm">
                      Use Template
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = `/templates/${t.id}/edit`;
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteTemplate(t.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}

      {selected ? (
        <TemplatePreviewDrawer
          template={selected}
          onClose={() => setSelected(null)}
          onUse={() => {
            window.location.href = `/send?templateId=${encodeURIComponent(selected.id)}`;
          }}
          onEdit={() => {
            window.location.href = `/templates/${selected.id}/edit`;
          }}
        />
      ) : null}
    </div>
  );
}

