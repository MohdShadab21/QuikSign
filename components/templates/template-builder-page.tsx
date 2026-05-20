"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DesignerField } from "@/components/envelopes/pdf-field-designer";
import { fieldFactoryDefaults } from "@/components/envelopes/field-factory";
import {
  FIELD_MIN_HEIGHT_PERCENT,
  FIELD_MIN_WIDTH_PERCENT,
} from "@/lib/envelopes/field-dimensions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { appAuthHeaders, withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";

const PdfFieldDesigner = dynamic(
  () => import("@/components/envelopes/pdf-field-designer").then((module) => module.PdfFieldDesigner),
  { ssr: false, loading: () => <p className="p-3 text-sm text-body">Loading field designer…</p> },
);

type DocumentOption = { id: string; fileName: string };

type RoleDraft = { id: string; roleName: string; role: "SIGNER" | "APPROVER" | "CC" };

type TemplateBuilderInitial = {
  id?: string;
  name: string;
  description: string;
  documentId: string;
  roles: RoleDraft[];
  fields: DesignerField[];
};

function uid() {
  return Math.random().toString(16).slice(2);
}

function roleEmail(roleName: string): string {
  const normalized = roleName.trim().toLowerCase().replaceAll(/\s+/g, ".");
  return `${normalized || "role"}@template.local`;
}

function roleNameFromEmail(email: string, roles: RoleDraft[]): string {
  const match = roles.find((r) => roleEmail(r.roleName) === email);
  return match?.roleName ?? roles[0]?.roleName ?? "Primary Signer";
}

function isImageLikeValue(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("data:image/") || trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

type Step = 1 | 2 | 3 | 4;

function Stepper({
  step,
  canGoTo,
  onGoTo,
}: {
  step: Step;
  canGoTo: (target: Step) => boolean;
  onGoTo: (target: Step) => void;
}) {
  const items: Array<{ id: Step; title: string; desc: string }> = [
    { id: 1, title: "Select Document", desc: "Choose base file" },
    { id: 2, title: "Define Roles", desc: "Who signs and in what order" },
    { id: 3, title: "Place Fields", desc: "Add fields onto the PDF" },
    { id: 4, title: "Review", desc: "Confirm and save template" },
  ];

  return (
    <div className="space-y-3">
      <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((step - 1) / 3) * 100}%` }}
          aria-hidden
        />
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        {items.map((it) => {
          const active = it.id === step;
          const enabled = canGoTo(it.id);
          return (
            <button
              key={it.id}
              type="button"
              disabled={!enabled}
              onClick={() => onGoTo(it.id)}
              className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                active
                  ? "border-primary bg-primary text-white shadow-sm"
                  : enabled
                    ? "border-border bg-surface text-text hover:bg-surface/95"
                    : "border-border bg-surface text-muted opacity-60"
              }`}
            >
              <p className="font-semibold">{it.title}</p>
              <p className={active ? "text-white/80" : "text-muted"}>{it.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RoleCard({
  role,
  index,
  color,
  onChange,
  onDelete,
  onDragStart,
  onDropOn,
}: {
  role: RoleDraft;
  index: number;
  color: string;
  onChange: (next: RoleDraft) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDropOn: () => void;
}) {
  return (
    <div
      className="rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:shadow-md"
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => {}}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOn}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: color }}>
              {index + 1}
            </span>
            <p className="text-sm font-semibold text-text">Signing order</p>
          </div>
          <div className="mt-3">
            <p className="text-label uppercase">Role name</p>
            <Input value={role.roleName} onChange={(e) => onChange({ ...role, roleName: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-label uppercase">Type</p>
            <select
              value={role.role}
              onChange={(e) => onChange({ ...role, role: e.target.value as RoleDraft["role"] })}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="SIGNER">Signer</option>
              <option value="APPROVER">Approver</option>
              <option value="CC">CC</option>
            </select>
          </div>
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TemplateBuilderPage({
  documents,
  initial,
}: {
  documents: DocumentOption[];
  initial: TemplateBuilderInitial;
}) {
  const { pushToast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<TemplateBuilderInitial>(initial);
  const [documentOptions, setDocumentOptions] = useState<DocumentOption[]>(documents);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragRoleId, setDragRoleId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewWithFieldsOpen, setPreviewWithFieldsOpen] = useState(false);

  // Step 3 placement state (kept consistent with envelope UX)
  const [placementPage, setPlacementPage] = useState(1);
  const [selectedRoleEmailForPlacement, setSelectedRoleEmailForPlacement] = useState<string>(() =>
    roleEmail(initial.roles[0]?.roleName ?? "Primary Signer"),
  );
  const [selectedFieldType, setSelectedFieldType] = useState<DesignerField["type"]>("SIGNATURE");
  const [placementMode, setPlacementMode] = useState<"DRAG" | "CLICK">("DRAG");
  const [selectedFieldIndexes, setSelectedFieldIndexes] = useState<number[]>([]);
  const [fieldHistory, setFieldHistory] = useState<DesignerField[][]>([]);

  const selectedFieldIndex = selectedFieldIndexes.length === 1 ? selectedFieldIndexes[0] : null;
  const selectedField = selectedFieldIndex === null ? null : draft.fields[selectedFieldIndex] ?? null;

  const roleColors = useMemo(() => ["#2563eb", "#059669", "#9333ea", "#ea580c"], []);

  // Keep the dropdown controlled even if roles change (e.g. user edits roles list).
  // We derive a safe "resolved" value instead of mutating state inside an effect.
  const selectedRoleEmailForPlacementResolved = useMemo(() => {
    const currentEmails = new Set(draft.roles.map((r) => roleEmail(r.roleName)));
    if (currentEmails.has(selectedRoleEmailForPlacement)) return selectedRoleEmailForPlacement;
    return roleEmail(draft.roles[0]?.roleName ?? "Primary Signer");
  }, [draft.roles, selectedRoleEmailForPlacement]);

  useEffect(() => {
    const loadPreview = async () => {
      if (!draft.documentId) {
        setPreviewUrl(null);
        return;
      }
      try {
        const response = await fetch(`/api/documents/${draft.documentId}`, { headers: appAuthHeaders() });
        const data = (await response.json()) as { document?: { signedDownloadUrl?: string } };
        if (!response.ok || !data.document?.signedDownloadUrl) {
          setPreviewUrl(null);
          return;
        }
        setPreviewUrl(data.document.signedDownloadUrl);
      } catch {
        setPreviewUrl(null);
      }
    };
    void loadPreview();
  }, [draft.documentId]);

  const canGoTo = (target: Step) => {
    if (target <= step) return true;
    const step1Ok = draft.name.trim().length >= 2 && Boolean(draft.documentId);
    const step2Ok = draft.roles.length >= 1 && draft.roles.every((r) => r.roleName.trim().length >= 2);
    const step3Ok = draft.fields.length >= 1;
    if (target === 2) return step1Ok;
    if (target === 3) return step1Ok && step2Ok;
    if (target === 4) return step1Ok && step2Ok && step3Ok;
    return false;
  };

  const applyFieldMutation = (mutate: (current: DesignerField[]) => DesignerField[]) => {
    setDraft((current) => {
      setFieldHistory((history) => [...history.slice(-39), current.fields]);
      return { ...current, fields: mutate(current.fields) };
    });
  };
  const undoFieldMutation = () => {
    setFieldHistory((history) => {
      const last = history.at(-1);
      if (!last) return history;
      setDraft((current) => ({ ...current, fields: last }));
      return history.slice(0, -1);
    });
  };
  const beginFieldInteraction = () => {
    setFieldHistory((history) => [...history.slice(-39), draft.fields]);
  };

  const reorderRoles = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setDraft((current) => {
      const fromIndex = current.roles.findIndex((r) => r.id === fromId);
      const toIndex = current.roles.findIndex((r) => r.id === toId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = current.roles.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved!);
      return { ...current, roles: next };
    });
  };

  const refreshDocuments = async () => {
    const response = await fetch("/api/documents", { headers: appAuthHeaders() });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      documents?: Array<{ id: string; fileName: string }>;
    };
    if (!response.ok) {
      throw new Error(mapApiErrorMessage(data.error ?? "Failed to load documents"));
    }
    const next = (data.documents ?? []).map((d) => ({ id: d.id, fileName: d.fileName }));
    setDocumentOptions(next);
    return next;
  };

  const uploadNewDocument = async () => {
    if (!uploadFile) {
      pushToast("Please select a PDF first.", "error");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const response = await fetch("/api/documents", { method: "POST", headers: appAuthHeaders(), body: formData });
      const data = (await response.json().catch(() => ({}))) as { error?: string; document?: { id: string; fileName: string } };
      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ?? "Upload failed"));
      }
      pushToast("Document uploaded.", "success");
      setUploadFile(null);
      const nextDocs = await refreshDocuments();
      const newId = data.document?.id ?? nextDocs[0]?.id ?? "";
      if (newId) {
        setDraft((d) => ({ ...d, documentId: newId }));
      }
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    } finally {
      setUploading(false);
    }
  };

  const payload = useMemo(() => {
    const signers = draft.roles.map((r, i) => ({ roleName: r.roleName.trim(), role: r.role, signingOrder: i + 1 }));
    const fields = draft.fields.map((field) => ({
      roleName: roleNameFromEmail(field.signerEmail, draft.roles),
      label: field.label ?? undefined,
      required: field.required ?? true,
      readOnly: field.readOnly ?? false,
      prefillValue: field.prefillValue ?? undefined,
      prefilledBySender: field.prefilledBySender ?? false,
      assignedRole: field.assignedRole ?? "RECIPIENT",
      valueType: field.valueType ?? "SIGNATURE",
      zIndex: field.zIndex ?? 1,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      type: field.type,
    }));
    return {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      documentId: draft.documentId,
      signers,
      fields,
    };
  }, [draft]);

  const save = async () => {
    setSaving(true);
    try {
      const endpoint = draft.id ? `/api/templates/${draft.id}` : "/api/templates";
      const method = draft.id ? "PATCH" : "POST";
      const response = await fetch(endpoint, { method, headers: withJsonHeaders(), body: JSON.stringify(payload) });
      const data = (await response.json().catch(() => ({}))) as { error?: string; templateId?: string };
      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ? String(data.error) : "Template save failed"));
      }
      pushToast(draft.id ? "Template updated." : "Template created.", "success");
      window.location.href = "/templates";
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-label uppercase">Template Builder</p>
          <h1 className="mt-1 text-heading text-2xl">{draft.id ? "Edit template" : "Create template"}</h1>
          <p className="mt-1 text-body text-sm">Define roles, place fields, and save a reusable workflow blueprint.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/templates">
            <Button>Back to library</Button>
          </Link>
          <Button variant="primary" disabled={!canGoTo(4) || saving} onClick={save}>
            {saving ? "Saving..." : "Save Template"}
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <Stepper step={step} canGoTo={canGoTo} onGoTo={setStep} />
      </Card>

      {step === 1 ? (
        <Card className="p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <p className="text-label uppercase">Template name</p>
              <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. HR Offer Letter" />
            </div>
            <div className="md:col-span-2">
              <p className="text-label uppercase">Description</p>
              <Input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Optional description" />
            </div>
            <div className="md:col-span-2">
              <p className="text-label uppercase">Select document</p>
              <select
                value={draft.documentId}
                onChange={(e) => setDraft((d) => ({ ...d, documentId: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="">Select a document</option>
                {documentOptions.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.fileName}
                  </option>
                ))}
              </select>
              {draft.documentId ? (
                <p className="mt-2 text-sm text-muted">
                  Selected: {documentOptions.find((d) => d.id === draft.documentId)?.fileName ?? "Unknown"}
                </p>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <div className="rounded-2xl border border-border bg-bg p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-text">Upload new PDF or Word</p>
                    <p className="mt-1 text-sm text-body">Word (.docx, .doc) is converted to PDF for placement and signing.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void refreshDocuments()}>
                      Refresh list
                    </Button>
                    <Button size="sm" variant="primary" disabled={!uploadFile || uploading} onClick={() => void uploadNewDocument()}>
                      {uploading ? "Uploading..." : "Upload"}
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-semibold file:text-text"
                  />
                  <p className="mt-2 text-xs text-muted">PDF or Word. Word is converted to PDF and selected automatically.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button variant="primary" disabled={!canGoTo(2)} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-heading text-lg">Roles</h2>
              <p className="text-body text-sm">Drag cards to reorder signing flow. Each role has a color for clarity.</p>
            </div>
            <Button
              variant="primary"
              onClick={() => setDraft((d) => ({ ...d, roles: [...d.roles, { id: uid(), roleName: `Role ${d.roles.length + 1}`, role: "SIGNER" }] }))}
            >
              Add Role
            </Button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {draft.roles.map((r, idx) => (
              <RoleCard
                key={r.id}
                role={r}
                index={idx}
                color={roleColors[idx % roleColors.length]!}
                onChange={(next) =>
                  setDraft((d) => ({ ...d, roles: d.roles.map((x) => (x.id === r.id ? next : x)) }))
                }
                onDelete={() => setDraft((d) => ({ ...d, roles: d.roles.length <= 1 ? d.roles : d.roles.filter((x) => x.id !== r.id) }))}
                onDragStart={() => setDragRoleId(r.id)}
                onDropOn={() => {
                  if (!dragRoleId) return;
                  reorderRoles(dragRoleId, r.id);
                  setDragRoleId(null);
                }}
              />
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button variant="primary" disabled={!canGoTo(3)} onClick={() => setStep(3)}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="p-6">
          <div className="mb-4">
            <h2 className="text-heading text-lg">Place Fields</h2>
            <p className="text-body text-sm">Left: roles & fields. Center: PDF. Right: field properties.</p>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-text">Tools</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="block text-xs text-body">
                  Role
                  <select
                    value={selectedRoleEmailForPlacementResolved}
                    onChange={(e) => setSelectedRoleEmailForPlacement(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-2 text-xs text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {draft.roles.map((r) => (
                      <option key={r.id} value={roleEmail(r.roleName)}>
                        {r.roleName} ({r.role})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-body">
                  Quick add type
                  <select
                    value={selectedFieldType}
                    onChange={(e) => setSelectedFieldType(e.target.value as DesignerField["type"])}
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-2 text-xs text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <option value="SIGNATURE">Signature</option>
                    <option value="SEAL">Stamp</option>
                    <option value="INITIAL">Initial</option>
                    <option value="DATE">Date</option>
                    <option value="NAME">Name</option>
                    <option value="EMAIL_ADDRESS">Email</option>
                    <option value="COMPANY">Company</option>
                    <option value="TITLE">Title</option>
                    <option value="TEXT">Text</option>
                    <option value="CHECKBOX">Checkbox</option>
                  </select>
                </label>
                <div className="rounded-lg border border-border bg-bg p-2">
                  <p className="text-[11px] font-medium text-text">Placement method</p>
                  <div className="mt-1 inline-flex rounded-lg border border-border bg-surface p-1">
                    <button
                      type="button"
                      onClick={() => setPlacementMode("DRAG")}
                      className={`rounded px-2 py-1 text-[11px] ${placementMode === "DRAG" ? "bg-primary text-white" : "text-text"}`}
                    >
                      Drag only
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlacementMode("CLICK")}
                      className={`rounded px-2 py-1 text-[11px] ${placementMode === "CLICK" ? "bg-primary text-white" : "text-text"}`}
                    >
                      Click to place
                    </button>
                  </div>
                </div>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      applyFieldMutation((current) => [
                        ...current,
                        {
                          signerEmail: selectedRoleEmailForPlacementResolved,
                          label: "",
                          required: true,
                          readOnly: false,
                          prefillValue: "",
                          prefilledBySender: false,
                          assignedRole: "RECIPIENT",
                          valueType:
                            selectedFieldType === "DATE"
                              ? "DATE"
                              : selectedFieldType === "CHECKBOX"
                                ? "CHECKBOX"
                                : selectedFieldType === "SEAL"
                                  ? "STAMP"
                                  : selectedFieldType === "SIGNATURE" || selectedFieldType === "INITIAL"
                                    ? "SIGNATURE"
                                    : "TEXT",
                          zIndex: current.length + 1,
                          page: placementPage,
                          x: 12,
                          y: 60,
                          width: fieldFactoryDefaults.width,
                          height: fieldFactoryDefaults.height,
                          type: selectedFieldType,
                        } as DesignerField,
                      ]);
                    }}
                  >
                    Quick Add Field
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-text">Field Items and others</p>
              <div className="mt-3 rounded-xl border border-border bg-bg p-3">
                <p className="text-xs font-medium text-text">Roles</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {draft.roles.map((r, idx) => {
                    const email = roleEmail(r.roleName);
                    const roleFieldCount = draft.fields.filter((f) => f.signerEmail === email).length;
                    return (
                      <div key={r.id} className="rounded-lg border border-border bg-surface p-2">
                        <p className="truncate text-[11px] font-semibold text-text">{idx + 1}. {r.roleName}</p>
                        <p className="mt-0.5 text-[11px] text-muted">{r.role} · {roleFieldCount} field(s)</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                <div className="min-w-0 rounded-xl border border-border bg-bg p-3">
                  <p className="mb-2 text-xs font-medium text-text">Document</p>
                  <PdfFieldDesigner
                    documentUrl={previewUrl}
                    selectedSignerEmail={selectedRoleEmailForPlacementResolved}
                    placementPage={placementPage}
                    fields={draft.fields}
                    selectedFieldType={selectedFieldType}
                    paletteVariant="icon"
                    showZoomControls
                    enableClickToPlace={placementMode === "CLICK"}
                    onAddField={(field) => applyFieldMutation((current) => [...current, field])}
                    onUpdateField={(index, updatedField) => applyFieldMutation((current) => current.map((f, i) => (i === index ? updatedField : f)))}
                    onDeleteField={(index) => applyFieldMutation((current) => current.filter((_, i) => i !== index))}
                    onClearPage={(page) => applyFieldMutation((current) => current.filter((f) => f.page !== page))}
                    onUndo={undoFieldMutation}
                    canUndo={fieldHistory.length > 0}
                    onSelectedFieldIndexesChange={setSelectedFieldIndexes}
                    onInteractionStart={beginFieldInteraction}
                    onPlacementPageChange={setPlacementPage}
                  />
                  {!previewUrl ? <p className="mt-2 text-sm text-muted">Document preview unavailable.</p> : null}
                </div>

                <div className="rounded-2xl border border-border bg-bg p-4 shadow-sm lg:sticky lg:top-24 lg:self-start">
                  <p className="text-xs font-medium text-text">Field Property</p>
                  <div className="mt-2 flex items-center justify-between">
                    <h3 className="text-heading text-lg">Field Properties</h3>
                    <span className="text-sm text-muted">{selectedField ? "1 selected" : "Select a field"}</span>
                  </div>
                  {!selectedField ? (
                    <p className="mt-3 text-sm text-body">Click a field on the PDF to edit default values.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-label uppercase">Label</p>
                    <Input
                      value={selectedField.label ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === selectedFieldIndex ? { ...f, label: v } : f)) }));
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 text-sm text-body">
                      <input
                        type="checkbox"
                        checked={selectedField.required ?? true}
                        onChange={(e) => setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === selectedFieldIndex ? { ...f, required: e.target.checked } : f)) }))}
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 text-sm text-body">
                      <input
                        type="checkbox"
                        checked={selectedField.readOnly ?? false}
                        onChange={(e) => setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === selectedFieldIndex ? { ...f, readOnly: e.target.checked } : f)) }))}
                      />
                      Read only
                    </label>
                  </div>

                  <div>
                    <p className="text-label uppercase">Position &amp; size (% of page)</p>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <label className="text-[11px] text-body">
                        X
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          max={100 - selectedField.width}
                          value={selectedField.x}
                          onChange={(e) => {
                            const x = Math.max(0, Math.min(Number(e.target.value) || 0, 100 - selectedField.width));
                            setDraft((d) => ({
                              ...d,
                              fields: d.fields.map((f, i) =>
                                i === selectedFieldIndex ? { ...f, x: Number(x.toFixed(2)) } : f,
                              ),
                            }));
                          }}
                          className="mt-0.5 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                      </label>
                      <label className="text-[11px] text-body">
                        Y
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          max={100 - selectedField.height}
                          value={selectedField.y}
                          onChange={(e) => {
                            const y = Math.max(0, Math.min(Number(e.target.value) || 0, 100 - selectedField.height));
                            setDraft((d) => ({
                              ...d,
                              fields: d.fields.map((f, i) =>
                                i === selectedFieldIndex ? { ...f, y: Number(y.toFixed(2)) } : f,
                              ),
                            }));
                          }}
                          className="mt-0.5 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                      </label>
                      <label className="text-[11px] text-body">
                        Width
                        <input
                          type="number"
                          step={0.01}
                          min={FIELD_MIN_WIDTH_PERCENT}
                          max={100 - selectedField.x}
                          value={selectedField.width}
                          onChange={(e) => {
                            const w = Math.max(
                              FIELD_MIN_WIDTH_PERCENT,
                              Math.min(Number(e.target.value) || FIELD_MIN_WIDTH_PERCENT, 100 - selectedField.x),
                            );
                            setDraft((d) => ({
                              ...d,
                              fields: d.fields.map((f, i) =>
                                i === selectedFieldIndex ? { ...f, width: Number(w.toFixed(2)) } : f,
                              ),
                            }));
                          }}
                          className="mt-0.5 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                      </label>
                      <label className="text-[11px] text-body">
                        Height
                        <input
                          type="number"
                          step={0.01}
                          min={FIELD_MIN_HEIGHT_PERCENT}
                          max={100 - selectedField.y}
                          value={selectedField.height}
                          onChange={(e) => {
                            const h = Math.max(
                              FIELD_MIN_HEIGHT_PERCENT,
                              Math.min(Number(e.target.value) || FIELD_MIN_HEIGHT_PERCENT, 100 - selectedField.y),
                            );
                            setDraft((d) => ({
                              ...d,
                              fields: d.fields.map((f, i) =>
                                i === selectedFieldIndex ? { ...f, height: Number(h.toFixed(2)) } : f,
                              ),
                            }));
                          }}
                          className="mt-0.5 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="text-label uppercase">Value type</p>
                    <select
                      value={selectedField.valueType ?? "SIGNATURE"}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          fields: d.fields.map((f, i) =>
                            i === selectedFieldIndex
                              ? { ...f, valueType: e.target.value as DesignerField["valueType"], prefillValue: e.target.value === "CHECKBOX" ? "false" : f.prefillValue ?? "" }
                              : f,
                          ),
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <option value="TEXT">Text</option>
                      <option value="DATE">Date</option>
                      <option value="CHECKBOX">Checkbox</option>
                      <option value="SIGNATURE">Signature</option>
                      <option value="STAMP">Stamp</option>
                    </select>
                  </div>

                  <div>
                    <p className="text-label uppercase">Default value</p>
                    {selectedField.valueType === "DATE" ? (
                      <input
                        type="date"
                        value={selectedField.prefillValue ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === selectedFieldIndex ? { ...f, prefillValue: e.target.value } : f)) }))}
                        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                    ) : selectedField.valueType === "CHECKBOX" ? (
                      <label className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body">
                        <input
                          type="checkbox"
                          checked={(selectedField.prefillValue ?? "false") === "true"}
                          onChange={(e) => setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === selectedFieldIndex ? { ...f, prefillValue: e.target.checked ? "true" : "false" } : f)) }))}
                        />
                        Checked by default
                      </label>
                    ) : selectedField.valueType === "STAMP" ? (
                      <div className="mt-1 space-y-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0] ?? null;
                            if (!file) return;
                            const dataUrl = await new Promise<string>((resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () => resolve(String(reader.result ?? ""));
                              reader.onerror = () => reject(new Error("Failed to read file"));
                              reader.readAsDataURL(file);
                            });
                            setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === selectedFieldIndex ? { ...f, prefillValue: dataUrl, valueType: "STAMP" } : f)) }));
                          }}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                        />
                        <Input value={selectedField.prefillValue ?? ""} onChange={(e) => setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === selectedFieldIndex ? { ...f, prefillValue: e.target.value } : f)) }))} />
                        {selectedField.prefillValue && isImageLikeValue(selectedField.prefillValue) ? (
                          <div className="rounded-lg border border-border bg-bg p-2">
                            <div className="h-24 w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${selectedField.prefillValue}")` }} />
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <Input value={selectedField.prefillValue ?? ""} onChange={(e) => setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === selectedFieldIndex ? { ...f, prefillValue: e.target.value } : f)) }))} />
                    )}
                  </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <Button onClick={() => setStep(2)}>Back</Button>
            <Button variant="primary" disabled={!canGoTo(4)} onClick={() => setStep(4)}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-heading text-lg">Review</h2>
              <p className="text-body text-sm">Confirm everything looks correct before saving.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <p className="text-label uppercase">Document</p>
              <p className="mt-1 font-semibold text-text">
                {documents.find((d) => d.id === draft.documentId)?.fileName ?? "Not selected"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setPreviewWithFieldsOpen(true)} disabled={!previewUrl}>
                  Preview with fields
                </Button>
                {previewUrl ? (
                  <a
                    className="inline-flex items-center rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text shadow-sm transition hover:bg-surface/95"
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open raw PDF
                  </a>
                ) : null}
              </div>
              <div className="mt-3">
                <Button size="sm" onClick={() => setStep(1)}>
                  Edit document
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <p className="text-label uppercase">Roles</p>
              <div className="mt-2 space-y-2">
                {draft.roles.map((r, idx) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-bg px-3 py-2 text-sm">
                    <p className="font-semibold text-text">
                      {idx + 1}. {r.roleName}
                    </p>
                    <span className="rounded-full bg-surface px-2 py-1 text-xs font-semibold text-muted">{r.role}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Button size="sm" onClick={() => setStep(2)}>
                  Edit roles
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <p className="text-label uppercase">Fields</p>
              <p className="mt-1 text-sm text-body">
                <span className="font-semibold text-text">{draft.fields.length}</span> field(s) placed
              </p>
              <div className="mt-3">
                <Button size="sm" onClick={() => setStep(3)}>
                  Edit fields
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {previewWithFieldsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-6xl rounded-2xl border border-border bg-surface p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-label uppercase">Preview</p>
                <h3 className="mt-1 text-heading text-xl">Preview with fields</h3>
                <p className="mt-1 text-body text-sm">This matches how the document will look to recipients.</p>
              </div>
              <Button size="sm" onClick={() => setPreviewWithFieldsOpen(false)}>
                Close
              </Button>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-bg p-3">
              <PdfFieldDesigner
                readOnly
                documentUrl={previewUrl}
                selectedSignerEmail={selectedRoleEmailForPlacementResolved}
                placementPage={placementPage}
                fields={draft.fields}
                selectedFieldType={selectedFieldType}
                selectedPaletteKey={selectedFieldType}
                onAddField={() => {}}
                onUpdateField={() => {}}
                onDeleteField={() => {}}
                onClearPage={() => {}}
                onUndo={() => {}}
                canUndo={false}
                onPlacementPageChange={setPlacementPage}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

