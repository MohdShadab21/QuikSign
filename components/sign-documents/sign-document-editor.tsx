"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { DesignerField } from "@/components/envelopes/pdf-field-designer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { useToast } from "@/components/ui/toast-provider";

const PdfFieldDesigner = dynamic(
  () => import("@/components/envelopes/pdf-field-designer").then((m) => m.PdfFieldDesigner),
  { ssr: false, loading: () => <p className="p-3 text-sm text-body">Loading field designer…</p> },
);

export function SignDocumentEditor({
  documentId,
  documentName,
  documentUrl,
  initialFields = [],
  initialSignerName = "",
  initialSignerEmail = "",
  initialSignatureValue = "",
  initialSealValue = "",
  hasServerSnapshot = false,
  serverSnapshotCreatedAt = "",
  mode = "mixed",
}: {
  documentId: string;
  documentName: string;
  documentUrl: string;
  initialFields?: DesignerField[];
  initialSignerName?: string;
  initialSignerEmail?: string;
  initialSignatureValue?: string;
  initialSealValue?: string;
  hasServerSnapshot?: boolean;
  serverSnapshotCreatedAt?: string;
  mode?: "mixed" | "edit" | "sign";
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [activeDocumentId, setActiveDocumentId] = useState(documentId);
  const [activeDocumentName, setActiveDocumentName] = useState(documentName);
  const [activeDocumentUrl, setActiveDocumentUrl] = useState(documentUrl);
  const draftStorageKey = useMemo(() => `quiksign:sign-document:draft:${activeDocumentId}`, [activeDocumentId]);
  const [fields, setFields] = useState<DesignerField[]>(initialFields);
  const [placementPage, setPlacementPage] = useState(1);
  const [selectedFieldType, setSelectedFieldType] = useState<DesignerField["type"]>("SIGNATURE");
  const [fieldHistory, setFieldHistory] = useState<DesignerField[][]>([]);
  const [selectedFieldIndexes, setSelectedFieldIndexes] = useState<number[]>([]);
  const [signatureValue, setSignatureValue] = useState(initialSignatureValue);
  const [sealValue, setSealValue] = useState(initialSealValue);
  const [signerName, setSignerName] = useState(initialSignerName || "Me");
  const [signerEmail, setSignerEmail] = useState(initialSignerEmail);
  const selectedSignerEmailForPlacement = useMemo(() => signerEmail.trim() || "self@local", [signerEmail]);
  const [saving, setSaving] = useState(false);
  const [fieldSignatureMode, setFieldSignatureMode] = useState<"TYPE" | "DRAW">("TYPE");
  const [userWorkMode, setUserWorkMode] = useState<"EDIT" | "SIGN">(mode === "sign" ? "SIGN" : "EDIT");
  const [placementMode, setPlacementMode] = useState<"DRAG" | "CLICK">("DRAG");
  const fieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldDrawingRef = useRef(false);
  const selectedFieldIndex = selectedFieldIndexes.length === 1 ? selectedFieldIndexes[0] : null;
  const selectedField = selectedFieldIndex === null ? null : fields[selectedFieldIndex] ?? null;
  const selectedFieldValueType = selectedField?.valueType ?? "TEXT";
  const restoredAtLabel = useMemo(() => {
    if (!serverSnapshotCreatedAt) return "";
    const date = new Date(serverSnapshotCreatedAt);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }, [serverSnapshotCreatedAt]);
  const isModeLocked = mode !== "mixed";
  const workMode = isModeLocked ? (mode === "sign" ? "SIGN" : "EDIT") : userWorkMode;

  const isImageLikeValue = (value: string): boolean => {
    const trimmed = value.trim().toLowerCase();
    return trimmed.startsWith("data:image/") || trimmed.startsWith("http://") || trimmed.startsWith("https://");
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        fields?: DesignerField[];
        placementPage?: number;
        selectedFieldType?: DesignerField["type"];
        signatureValue?: string;
        sealValue?: string;
        signerName?: string;
        signerEmail?: string;
      };

      queueMicrotask(() => {
        if (Array.isArray(parsed.fields)) {
          setFields(parsed.fields);
        } else if (initialFields.length > 0) {
          setFields(initialFields);
        }
        if (typeof parsed.placementPage === "number") setPlacementPage(parsed.placementPage);
        if (parsed.selectedFieldType) setSelectedFieldType(parsed.selectedFieldType);

        if (typeof parsed.signatureValue === "string") setSignatureValue(parsed.signatureValue);
        else if (initialSignatureValue) setSignatureValue(initialSignatureValue);

        if (typeof parsed.sealValue === "string") setSealValue(parsed.sealValue);
        else if (initialSealValue) setSealValue(initialSealValue);

        if (typeof parsed.signerName === "string" && parsed.signerName.trim()) setSignerName(parsed.signerName);
        else if (initialSignerName.trim()) setSignerName(initialSignerName);

        if (typeof parsed.signerEmail === "string") setSignerEmail(parsed.signerEmail);
        else if (initialSignerEmail.trim()) setSignerEmail(initialSignerEmail);
      });
    } catch {
      // Fallback to server snapshot when local draft is invalid
      queueMicrotask(() => {
        if (initialFields.length > 0) setFields(initialFields);
        if (initialSignatureValue) setSignatureValue(initialSignatureValue);
        if (initialSealValue) setSealValue(initialSealValue);
        if (initialSignerName.trim()) setSignerName(initialSignerName);
        if (initialSignerEmail.trim()) setSignerEmail(initialSignerEmail);
      });
    }
  }, [
    draftStorageKey,
    initialFields,
    initialSealValue,
    initialSignatureValue,
    initialSignerEmail,
    initialSignerName,
  ]);

  useEffect(() => {
    const payload = {
      fields,
      placementPage,
      selectedFieldType,
      signatureValue,
      sealValue,
      signerName,
      signerEmail,
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
  }, [
    draftStorageKey,
    fields,
    placementPage,
    selectedFieldType,
    signatureValue,
    sealValue,
    signerName,
    signerEmail,
  ]);

  const applyFieldMutation = (mutate: (current: DesignerField[]) => DesignerField[]) => {
    setFields((current) => {
      setFieldHistory((history) => [...history.slice(-39), current]);
      return mutate(current);
    });
  };
  const undoFieldMutation = () => {
    setFieldHistory((history) => {
      const last = history.at(-1);
      if (!last) return history;
      setFields(last);
      return history.slice(0, -1);
    });
  };

  const onAddField = () => {
    applyFieldMutation((current) => [
      ...current,
      {
        signerEmail: selectedSignerEmailForPlacement.trim() || "self@local",
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
        width: 18,
        height: 12,
        type: selectedFieldType,
      },
    ]);
  };

  const updateSelectedField = (patch: Partial<DesignerField>) => {
    if (selectedFieldIndex === null) return;
    setFields((current) =>
      current.map((entry, index) => (index === selectedFieldIndex ? { ...entry, ...patch } : entry)),
    );
  };

  const pointFromClient = (clientX: number, clientY: number) => {
    const canvas = fieldCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const beginFieldDrawing = (clientX: number, clientY: number) => {
    const canvas = fieldCanvasRef.current;
    const point = pointFromClient(clientX, clientY);
    if (!canvas || !point) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.strokeStyle = "#0f172a";
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(point.x, point.y);
    fieldDrawingRef.current = true;
  };
  const continueFieldDrawing = (clientX: number, clientY: number) => {
    if (!fieldDrawingRef.current) return;
    const canvas = fieldCanvasRef.current;
    const point = pointFromClient(clientX, clientY);
    if (!canvas || !point) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };
  const endFieldDrawing = () => {
    if (!fieldDrawingRef.current) return;
    fieldDrawingRef.current = false;
    const canvas = fieldCanvasRef.current;
    if (!canvas) return;
    updateSelectedField({ prefillValue: canvas.toDataURL("image/png"), valueType: "SIGNATURE" });
  };
  const onStampUploadForSelectedField = async (file: File | null) => {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
    updateSelectedField({ prefillValue: dataUrl, valueType: "STAMP" });
  };

  useEffect(() => {
    if (!selectedField || selectedFieldValueType !== "SIGNATURE" || fieldSignatureMode !== "DRAW") return;
    const canvas = fieldCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const value = selectedField.prefillValue ?? "";
    if (!value.startsWith("data:image/")) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [fieldSignatureMode, selectedField, selectedFieldValueType]);

  const saveSigned = async () => {
    setSaving(true);
    try {
      const normalizedFields = fields.map((f) => {
        const inferredValueType: NonNullable<DesignerField["valueType"]> =
          f.valueType
          ?? (f.type === "DATE"
            ? "DATE"
            : f.type === "CHECKBOX"
              ? "CHECKBOX"
              : f.type === "SEAL"
                ? "STAMP"
                : f.type === "SIGNATURE" || f.type === "INITIAL"
                  ? "SIGNATURE"
                  : "TEXT");
        const rawPrefill = (f.prefillValue ?? "").toString();
        const normalizedPrefill =
          inferredValueType === "DATE"
            ? (rawPrefill.trim() || new Date().toISOString().slice(0, 10))
            : inferredValueType === "CHECKBOX"
              ? ((rawPrefill.trim() || "false").toLowerCase() === "true" ? "true" : "false")
              : inferredValueType === "STAMP"
                ? (rawPrefill.trim() || sealValue.trim() || `STAMP: ${signerName || "Me"}`)
                : inferredValueType === "SIGNATURE"
                  ? (rawPrefill.trim() || signatureValue.trim() || signerName.trim() || "Signed")
                  : rawPrefill;

        return {
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          type: f.type,
          label: f.label ?? "",
          valueType: inferredValueType,
          prefillValue: normalizedPrefill,
        };
      });

      const response = await fetch("/api/sign-documents/save", {
        method: "POST",
        headers: withJsonHeaders(),
        body: JSON.stringify({
          documentId: activeDocumentId,
          fields: normalizedFields,
          signerName,
          signerEmail: signerEmail.trim() || selectedSignerEmailForPlacement.trim(),
          signatureValue,
          sealValue,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        downloadUrl?: string;
        fileName?: string;
        documentId?: string;
      };
      if (!response.ok) throw new Error(mapApiErrorMessage(data.error ?? "Save failed"));
      pushToast("Signed copy saved as a new document.", "success");
      if (data.documentId) {
        setActiveDocumentId(data.documentId);
        router.replace(`/sign-documents/${data.documentId}`);
      }
      if (data.fileName) {
        setActiveDocumentName(data.fileName);
      }
      if (data.downloadUrl) {
        setActiveDocumentUrl(data.downloadUrl);
      }
      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <div>
          <h2 className="truncate text-heading text-xl">{activeDocumentName}</h2>
          <p className="text-sm text-body">
            {workMode === "EDIT"
              ? "Editor mode: place and configure fields."
              : "Signing mode: fill fields and finalize."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasServerSnapshot ? (
            <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-medium text-body">
              {restoredAtLabel ? `Latest saved fields restored - ${restoredAtLabel}` : "Latest saved fields restored"}
            </span>
          ) : null}
          {!isModeLocked ? (
            <div className="inline-flex rounded-xl border border-border bg-bg p-1">
              <button
                type="button"
                onClick={() => setUserWorkMode("EDIT")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${workMode === "EDIT" ? "bg-primary text-white" : "text-body hover:bg-surface"}`}
              >
                Editor Mode
              </button>
              <button
                type="button"
                onClick={() => setUserWorkMode("SIGN")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${workMode === "SIGN" ? "bg-primary text-white" : "text-body hover:bg-surface"}`}
              >
                Signing Mode
              </button>
            </div>
          ) : (
            <span className="rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium text-body">
              {workMode === "EDIT" ? "Editor Mode" : "Signing Mode"}
            </span>
          )}
        </div>
      </header>

      <section className="space-y-4">
        {workMode === "EDIT" ? (
          <aside className="space-y-3 rounded-2xl border border-border bg-surface p-3">
            <p className="text-sm font-semibold text-text">Tools</p>
            <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Signer name" />
            <Input value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="Signer email" />
            <label className="block text-xs text-body">
              Quick add type
              <select
                value={selectedFieldType}
                onChange={(e) => setSelectedFieldType(e.target.value as DesignerField["type"])}
                className="mt-1 w-full rounded-lg border border-border bg-bg px-2 py-2 text-sm text-text"
              >
                <option value="SIGNATURE">Signature</option>
                <option value="TEXT">Text</option>
                <option value="DATE">Date</option>
                <option value="CHECKBOX">Checkbox</option>
                <option value="SEAL">Stamp</option>
                <option value="INITIAL">Initial</option>
              </select>
            </label>
            <Button type="button" variant="primary" onClick={onAddField} className="w-full">
              Quick Add Field
            </Button>
            <div className="rounded-lg border border-border bg-bg p-2">
              <p className="text-[11px] font-medium text-text">Placement method</p>
              <div className="mt-1 inline-flex rounded-lg border border-border bg-surface p-1">
                <button
                  type="button"
                  onClick={() => setPlacementMode("DRAG")}
                  className={`rounded px-2 py-1 text-[11px] ${placementMode === "DRAG" ? "bg-primary text-white" : "text-body"}`}
                >
                  Drag only
                </button>
                <button
                  type="button"
                  onClick={() => setPlacementMode("CLICK")}
                  className={`rounded px-2 py-1 text-[11px] ${placementMode === "CLICK" ? "bg-primary text-white" : "text-body"}`}
                >
                  Click to place
                </button>
              </div>
            </div>
          </aside>
        ) : null}

        <div className={`grid gap-4 ${workMode === "EDIT" ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1"}`}>
          <div className="min-w-0 space-y-2 rounded-2xl border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
            <label>
              Page
              <input
                type="number"
                min={1}
                value={placementPage}
                onChange={(event) => setPlacementPage(Number(event.target.value))}
                className="ml-2 w-20 rounded-md border border-border bg-bg px-2 py-1"
              />
            </label>
            {selectedFieldIndex !== null && workMode === "EDIT" ? (
              <button
                type="button"
                onClick={() => {
                  const selected = fields[selectedFieldIndex];
                  if (selected) setPlacementPage(selected.page);
                }}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1.5"
              >
                <span aria-hidden>↳</span>
                Jump to Selected Field
              </button>
            ) : null}
            <div className="ml-auto inline-flex min-w-[220px] items-center rounded-xl border border-border bg-bg px-2 py-1.5 text-[11px] text-body">
              Signer: {selectedSignerEmailForPlacement || "self@local"}
            </div>
            </div>
            <PdfFieldDesigner
              documentUrl={activeDocumentUrl}
              selectedSignerEmail={selectedSignerEmailForPlacement.trim() || "self@local"}
              placementPage={placementPage}
              fields={fields}
              selectedFieldType={selectedFieldType}
              paletteVariant="compact"
              enableClickToPlace={workMode === "EDIT" && placementMode === "CLICK"}
              onAddField={(field) => applyFieldMutation((current) => [...current, field])}
              onUpdateField={(index, updatedField) =>
                setFields((current) => current.map((f, i) => (i === index ? updatedField : f)))
              }
              onDeleteField={(index) => applyFieldMutation((current) => current.filter((_, i) => i !== index))}
              onClearPage={(page) => applyFieldMutation((current) => current.filter((f) => f.page !== page))}
              onUndo={undoFieldMutation}
              canUndo={fieldHistory.length > 0}
              onPageBounds={(numPages) => {
                if (placementPage > numPages) setPlacementPage(numPages);
              }}
              onPlacementPageChange={setPlacementPage}
              onSelectedFieldIndexesChange={setSelectedFieldIndexes}
              readOnly={workMode === "SIGN"}
            />
          </div>
          {workMode === "EDIT" ? (
            <aside className="space-y-2 rounded-2xl border border-border bg-surface p-3 text-xs lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Field Properties</p>
              <span className="rounded bg-bg px-2 py-0.5 text-[10px] text-muted">
                {selectedField ? "Selected" : "Ready"}
              </span>
            </div>
            {!selectedField ? (
              <p className="opacity-75">Select a field to edit properties.</p>
            ) : (
              <>
                <label className="block">
                  Label
                  <input
                    value={selectedField.label ?? ""}
                    onChange={(event) => updateSelectedField({ label: event.target.value })}
                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1"
                  />
                </label>
                <label className="block">
                  Assigned signer
                  <input
                    value={selectedField.signerEmail ?? ""}
                    onChange={(event) => updateSelectedField({ signerEmail: event.target.value })}
                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1"
                  />
                </label>
                <label className="block">
                  Field type
                  <select
                    value={selectedField.type}
                    onChange={(event) => updateSelectedField({ type: event.target.value as DesignerField["type"] })}
                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1"
                  >
                    <option value="SIGNATURE">Signature</option>
                    <option value="TEXT">Text</option>
                    <option value="DATE">Date</option>
                    <option value="CHECKBOX">Checkbox</option>
                    <option value="SEAL">Stamp</option>
                  </select>
                </label>
                <label className="block">
                  Value Type
                  <select
                    value={selectedFieldValueType}
                    onChange={(event) =>
                      updateSelectedField({
                        valueType: event.target.value as DesignerField["valueType"],
                        prefillValue: event.target.value === "CHECKBOX" ? "false" : selectedField.prefillValue ?? "",
                      })
                    }
                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1"
                  >
                    <option value="TEXT">Text</option>
                    <option value="DATE">Date</option>
                    <option value="CHECKBOX">Checkbox</option>
                    <option value="SIGNATURE">Signature</option>
                    <option value="STAMP">Stamp</option>
                  </select>
                </label>
                <label className="block">
                  Default value
                  {selectedFieldValueType === "DATE" ? (
                    <input
                      type="date"
                      value={selectedField.prefillValue ?? ""}
                      onChange={(event) => updateSelectedField({ prefillValue: event.target.value })}
                      className="mt-1 w-full rounded border border-border bg-bg px-2 py-1"
                    />
                  ) : selectedFieldValueType === "CHECKBOX" ? (
                    <label className="mt-1 inline-flex items-center gap-2 rounded border border-border bg-bg px-2 py-1">
                      <input
                        type="checkbox"
                        checked={(selectedField.prefillValue ?? "false") === "true"}
                        onChange={(event) => updateSelectedField({ prefillValue: event.target.checked ? "true" : "false" })}
                      />
                      Checked by default
                    </label>
                  ) : selectedFieldValueType === "SIGNATURE" ? (
                    <div className="mt-1 space-y-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFieldSignatureMode("TYPE")}
                          className={`rounded px-2 py-1 text-[11px] ${fieldSignatureMode === "TYPE" ? "bg-primary text-white" : "border border-border"}`}
                        >
                          Type
                        </button>
                        <button
                          type="button"
                          onClick={() => setFieldSignatureMode("DRAW")}
                          className={`rounded px-2 py-1 text-[11px] ${fieldSignatureMode === "DRAW" ? "bg-primary text-white" : "border border-border"}`}
                        >
                          Draw
                        </button>
                      </div>
                      {fieldSignatureMode === "TYPE" ? (
                        <input
                          value={selectedField.prefillValue?.startsWith("data:image/") ? "" : selectedField.prefillValue ?? ""}
                          onChange={(event) => updateSelectedField({ prefillValue: event.target.value, valueType: "SIGNATURE" })}
                          placeholder="Type signature"
                          className="w-full rounded border border-border bg-bg px-2 py-1"
                          style={{ fontFamily: '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive' }}
                        />
                      ) : (
                        <div className="space-y-2">
                          <canvas
                            ref={fieldCanvasRef}
                            width={420}
                            height={120}
                            className="w-full touch-none rounded border border-border bg-white"
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.currentTarget.setPointerCapture(event.pointerId);
                              beginFieldDrawing(event.clientX, event.clientY);
                            }}
                            onPointerMove={(event) => {
                              event.preventDefault();
                              continueFieldDrawing(event.clientX, event.clientY);
                            }}
                            onPointerUp={(event) => {
                              event.preventDefault();
                              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                event.currentTarget.releasePointerCapture(event.pointerId);
                              }
                              endFieldDrawing();
                            }}
                            onPointerLeave={() => endFieldDrawing()}
                            onPointerCancel={() => endFieldDrawing()}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const canvas = fieldCanvasRef.current;
                              if (!canvas) return;
                              const context = canvas.getContext("2d");
                              if (!context) return;
                              context.fillStyle = "#ffffff";
                              context.fillRect(0, 0, canvas.width, canvas.height);
                              updateSelectedField({ prefillValue: "", valueType: "SIGNATURE" });
                            }}
                            className="rounded border border-border px-2 py-1 text-[11px]"
                          >
                            Clear Drawing
                          </button>
                        </div>
                      )}
                    </div>
                  ) : selectedFieldValueType === "STAMP" ? (
                    <div className="mt-1 space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          void onStampUploadForSelectedField(event.target.files?.[0] ?? null);
                        }}
                        className="w-full rounded border border-border bg-bg px-2 py-1"
                      />
                      <textarea
                        value={selectedField.prefillValue ?? ""}
                        onChange={(event) => updateSelectedField({ prefillValue: event.target.value, valueType: "STAMP" })}
                        placeholder="Paste stamp image URL, base64 image, or text"
                        rows={2}
                        className="w-full rounded border border-border bg-bg px-2 py-1"
                      />
                      {selectedField.prefillValue && isImageLikeValue(selectedField.prefillValue) ? (
                        <div className="rounded border border-border bg-white p-1">
                          <div
                            className="h-20 w-full bg-contain bg-center bg-no-repeat"
                            style={{ backgroundImage: `url("${selectedField.prefillValue}")` }}
                            aria-label="Stamp preview"
                            role="img"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <input
                      value={selectedField.prefillValue ?? ""}
                      onChange={(event) => updateSelectedField({ prefillValue: event.target.value })}
                      placeholder="Enter field value"
                      className="mt-1 w-full rounded border border-border bg-bg px-2 py-1"
                    />
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => updateSelectedField({ prefillValue: "" })}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1.5"
                >
                  <span aria-hidden>⟲</span>
                  Reset field value
                </button>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedField.required ?? true}
                    onChange={(event) => updateSelectedField({ required: event.target.checked })}
                  />
                  Required
                </label>
              </>
            )}
          </aside>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => window.history.back()}>Back</Button>
        <a href={activeDocumentUrl} target="_blank" rel="noreferrer">
          <Button>Download Raw PDF</Button>
        </a>
        <Button variant="primary" disabled={fields.length === 0 || saving} onClick={() => void saveSigned()}>
          {saving ? "Saving..." : workMode === "SIGN" ? "Finalize Document" : "Save Signed Copy"}
        </Button>
      </div>
    </div>
  );
}

