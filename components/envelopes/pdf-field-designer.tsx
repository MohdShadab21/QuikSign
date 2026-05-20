"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { buildDefaultField, fieldFactoryDefaults } from "@/components/envelopes/field-factory";
import { isSenderLockedField, signingFieldBadge } from "@/lib/signing/field-access";
import {
  FIELD_MIN_HEIGHT_PERCENT,
  FIELD_MIN_WIDTH_PERCENT,
  FIELD_RESIZE_SNAP_PERCENT,
} from "@/lib/envelopes/field-dimensions";

// Self-hosted worker copied into /public via scripts/copy-pdf-worker.mjs (runs on postinstall
// + prebuild). Served same-origin so CSP doesn't need to whitelist a CDN.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export type DesignerField = {
  id?: string;
  signerEmail: string;
  label?: string;
  required?: boolean;
  readOnly?: boolean;
  prefillValue?: string;
  prefilledBySender?: boolean;
  assignedRole?: "SENDER" | "RECIPIENT";
  valueType?: "TEXT" | "DATE" | "CHECKBOX" | "SIGNATURE" | "STAMP";
  zIndex?: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type:
    | "SIGNATURE"
    | "SEAL"
    | "INITIAL"
    | "DATE"
    | "NAME"
    | "FIRST_NAME"
    | "LAST_NAME"
    | "EMAIL_ADDRESS"
    | "COMPANY"
    | "TITLE"
    | "TEXT"
    | "CHECKBOX";
};

type PdfFieldDesignerProps = {
  documentUrl: string | null;
  documentRequestHeaders?: Record<string, string>;
  selectedSignerEmail: string;
  prefillEditingMode?: "all" | "senderOnly";
  placementPage: number;
  fields: DesignerField[];
  onAddField: (field: DesignerField) => void;
  onUpdateField: (index: number, field: DesignerField) => void;
  onDeleteField: (index: number) => void;
  onClearPage: (page: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  onPageBounds?: (numPages: number) => void;
  onPlacementPageChange?: (page: number) => void;
  selectedFieldType?: DesignerField["type"];
  selectedPaletteKey?: string;
  onSelectedFieldIndexesChange?: (indexes: number[]) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  readOnly?: boolean;
  paletteVariant?: "full" | "compact" | "icon";
  enableClickToPlace?: boolean;
  showZoomControls?: boolean;
  minimalViewerChrome?: boolean;
  fieldLabelMode?: "technical" | "clean" | "none";
  /** When set with readOnly, shows Sender / Your field / Recipient badges and blocks clicks on locked sender fields. */
  signingViewEmail?: string;
  onReadOnlyFieldClick?: (field: DesignerField, index: number) => void;
  onDocumentAccessError?: () => void;
  /** Applied to the root flex column (use `h-full min-h-0` when parent constrains height). */
  className?: string;
};

type DragState = {
  mode: "move" | "resize";
  index: number;
  startClientX: number;
  startClientY: number;
  startField: DesignerField;
  selectedIndexes: number[];
  startFieldsByIndex: Record<number, DesignerField>;
};

const palette: Array<{ id: string; label: string; type: DesignerField["type"]; signatureMode?: "DRAW" | "TYPE" }> = [
  { id: "signature-type", label: "Signature", type: "SIGNATURE" },
  { id: "initial", label: "Initial", type: "INITIAL" },
  { id: "stamp", label: "Stamp", type: "SEAL" },
  { id: "date", label: "Date", type: "DATE" },
  { id: "name", label: "Name", type: "NAME" },
  { id: "first-name", label: "First Name", type: "FIRST_NAME" },
  { id: "last-name", label: "Last Name", type: "LAST_NAME" },
  { id: "email", label: "Email", type: "EMAIL_ADDRESS" },
  { id: "company", label: "Company", type: "COMPANY" },
  { id: "title", label: "Title", type: "TITLE" },
  { id: "text", label: "Text", type: "TEXT" },
  { id: "checkbox", label: "Checkbox", type: "CHECKBOX" },
];
const compactPalette: Array<{ id: string; label: string; type: DesignerField["type"]; icon: string }> = [
  { id: "signature", label: "Signature", type: "SIGNATURE", icon: "S" },
  { id: "text", label: "Text", type: "TEXT", icon: "T" },
  { id: "stamp", label: "Stamp", type: "SEAL", icon: "P" },
  { id: "date", label: "Date", type: "DATE", icon: "D" },
  { id: "checkbox", label: "Checkbox", type: "CHECKBOX", icon: "C" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Map viewport pointer position to % on the PDF page (works when the page is scrolled). */
function pointerToPagePercent(pageEl: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = pageEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  };
}

function snapToGrid(value: number, step = 1): number {
  return Math.round(value / step) * step;
}

/** Keeps the same object reference when header key/values are unchanged (avoids react-pdf Document reload warnings). */
function useStableHttpHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  const key = headers
    ? Object.keys(headers)
        .sort()
        .map((headerKey) => `${headerKey}:${headers[headerKey]}`)
        .join("|")
    : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: rely on serialized `key` to detect changes
  return useMemo(() => headers, [key]);
}

function emailColor(email?: string | null): { border: string; fill: string; label: string } {
  const palette = [
    { border: "#3b82f6", fill: "rgba(59,130,246,0.09)", label: "#1d4ed8" },
    { border: "#10b981", fill: "rgba(16,185,129,0.09)", label: "#047857" },
    { border: "#a855f7", fill: "rgba(168,85,247,0.09)", label: "#7e22ce" },
    { border: "#f97316", fill: "rgba(249,115,22,0.1)", label: "#c2410c" },
  ];
  const safeEmail = (email ?? "").trim() || "unknown@local";
  let hash = 0;
  for (let i = 0; i < safeEmail.length; i += 1) {
    hash = (hash << 5) - hash + safeEmail.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length]!;
}

/** Widget renderer follows palette field type first so signature/stamp prefills still show if valueType was left as TEXT. */
function inferValueType(field: DesignerField): NonNullable<DesignerField["valueType"]> {
  if (field.type === "SIGNATURE" || field.type === "INITIAL") {
    return "SIGNATURE";
  }
  if (field.type === "SEAL") {
    return "STAMP";
  }
  if (field.type === "DATE") {
    return "DATE";
  }
  if (field.type === "CHECKBOX") {
    return "CHECKBOX";
  }
  if (field.valueType) {
    return field.valueType;
  }
  return "TEXT";
}

function isImageLike(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("data:image/") ||
    trimmed.endsWith(".png") ||
    trimmed.endsWith(".jpg") ||
    trimmed.endsWith(".jpeg") ||
    trimmed.endsWith(".webp") ||
    trimmed.endsWith(".gif") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  );
}

function nudgeField(field: DesignerField, deltaX: number, deltaY: number): DesignerField {
  return {
    ...field,
    x: Number(clamp(field.x + deltaX, 0, 100 - field.width).toFixed(2)),
    y: Number(clamp(field.y + deltaY, 0, 100 - field.height).toFixed(2)),
  };
}

function isSenderPlacementField(field: DesignerField, prefillEditingMode: "all" | "senderOnly"): boolean {
  return prefillEditingMode === "senderOnly" && field.assignedRole === "SENDER";
}

function signatureDisplayValue(raw: string | boolean | undefined | null): string {
  if (typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "Signed" || trimmed === "Stamped") {
    return "";
  }
  return trimmed;
}

export function PdfFieldDesigner({
  documentUrl,
  documentRequestHeaders,
  selectedSignerEmail,
  prefillEditingMode = "all",
  placementPage,
  fields,
  onAddField,
  onUpdateField,
  onDeleteField,
  onClearPage,
  onUndo,
  canUndo,
  onPageBounds,
  onPlacementPageChange,
  selectedFieldType = "SIGNATURE",
  selectedPaletteKey,
  onSelectedFieldIndexesChange,
  onInteractionStart,
  onInteractionEnd,
  readOnly = false,
  paletteVariant = "full",
  enableClickToPlace = false,
  showZoomControls = false,
  minimalViewerChrome = false,
  fieldLabelMode = "technical",
  signingViewEmail,
  onReadOnlyFieldClick,
  onDocumentAccessError,
  className = "",
}: PdfFieldDesignerProps) {
  const [numPages, setNumPages] = useState(1);
  const [renderWidth, setRenderWidth] = useState(760);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selectedFieldIndexes, setSelectedFieldIndexes] = useState<number[]>([]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const pageSurfaceRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);

  const getPageCoords = useCallback((clientX: number, clientY: number) => {
    const pageEl = pageSurfaceRef.current ?? canvasRef.current;
    if (!pageEl) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }
    const rect = pageEl.getBoundingClientRect();
    const { x, y } = pointerToPagePercent(pageEl, clientX, clientY);
    return { x, y, width: rect.width, height: rect.height };
  }, []);

  const safePage = Math.max(1, Math.min(placementPage, numPages));
  const goToPage = (nextPage: number) => {
    if (!onPlacementPageChange) return;
    onPlacementPageChange(Math.max(1, Math.min(numPages, nextPage)));
  };

  const stableRequestHeaders = useStableHttpHeaders(documentRequestHeaders);

  const documentFile = useMemo(() => {
    if (!documentUrl) return null;
    if (!stableRequestHeaders) return documentUrl;
    return { url: documentUrl, httpHeaders: stableRequestHeaders };
  }, [documentUrl, stableRequestHeaders]);

  const scrollCanvasToTop = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    // Use rAF to ensure layout is ready (react-pdf renders async).
    requestAnimationFrame(() => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    });
  }, []);

  useEffect(() => {
    // Ensure the top of the PDF is visible when page/doc changes.
    scrollCanvasToTop();
  }, [documentUrl, safePage, scrollCanvasToTop]);

  // Keep wheel/trackpad scroll inside the PDF pane instead of scrolling the whole page.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      const canScrollY = el.scrollHeight > el.clientHeight + 1;
      const canScrollX = el.scrollWidth > el.clientWidth + 1;
      if (!canScrollY && !canScrollX) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (canScrollY) {
        el.scrollTop += event.deltaY;
      }
      if (canScrollX) {
        el.scrollLeft += event.deltaX;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [documentUrl, safePage]);

  const pageFields = useMemo(
    () =>
      fields
        .map((field, index) => ({ field, index }))
        .filter((entry) => entry.field.page === safePage),
    [fields, safePage],
  );
  const sortedPageFields = useMemo(
    () =>
      [...pageFields].sort(
        (a, b) => (a.field.zIndex ?? 1) - (b.field.zIndex ?? 1) || a.index - b.index,
      ),
    [pageFields],
  );

  const selectedOnPage = useMemo(
    () => pageFields.find((entry) => selectedFieldIndexes.includes(entry.index)) ?? null,
    [pageFields, selectedFieldIndexes],
  );

  useEffect(() => {
    onSelectedFieldIndexesChange?.(selectedFieldIndexes);
  }, [onSelectedFieldIndexesChange, selectedFieldIndexes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (readOnly) {
        return;
      }
      if (isTypingTarget) {
        return;
      }
      if (event.key === "Escape") {
        setSelectedFieldIndexes([]);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedFieldIndexes.length > 0) {
        const sorted = [...selectedFieldIndexes].sort((a, b) => b - a);
        for (const index of sorted) {
          onDeleteField(index);
        }
        setSelectedFieldIndexes([]);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selectedFieldIndexes.length > 0) {
        event.preventDefault();
        const selectedPageFields = sortedPageFields.filter((entry) => selectedFieldIndexes.includes(entry.index));
        for (const selected of selectedPageFields) {
          onAddField({
            ...selected.field,
            x: Number(clamp(selected.field.x + 2, 0, 100 - selected.field.width).toFixed(2)),
            y: Number(clamp(selected.field.y + 2, 0, 100 - selected.field.height).toFixed(2)),
          });
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        onUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onAddField, onDeleteField, onUndo, readOnly, selectedFieldIndexes, sortedPageFields]);

  const onCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (readOnly) {
      setSelectedFieldIndexes([]);
      return;
    }
    if (enableClickToPlace && selectedSignerEmail && (pageSurfaceRef.current || canvasRef.current)) {
      const { x: rawX, y: rawY } = getPageCoords(event.clientX, event.clientY);
      const width = fieldFactoryDefaults.width;
      const height = fieldFactoryDefaults.height;
      const x = Number(clamp(rawX - width / 2, 0, 100 - width).toFixed(2));
      const y = Number(clamp(rawY - height / 2, 0, 100 - height).toFixed(2));
      const maxZ = fields.reduce((currentMax, entry) => Math.max(currentMax, entry.zIndex ?? 1), 1);
      onAddField(buildDefaultField({ type: selectedFieldType, signerEmail: selectedSignerEmail, page: safePage, x, y, zIndex: maxZ + 1 }));
      return;
    }
    setSelectedFieldIndexes([]);
  };

  const onCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (readOnly) {
      return;
    }
    if (!selectedSignerEmail || !(pageSurfaceRef.current || canvasRef.current)) {
      return;
    }
    const draggedType = event.dataTransfer.getData("application/x-quiksign-field-type") as DesignerField["type"];
    const signatureMode = event.dataTransfer.getData("application/x-quiksign-signature-mode");
    if (!draggedType) {
      return;
    }
    const { x: rawX, y: rawY } = getPageCoords(event.clientX, event.clientY);
    let x = Number(clamp(rawX, 0, 100).toFixed(2));
    let y = Number(clamp(rawY, 0, 100).toFixed(2));
    const maxZ = fields.reduce((currentMax, entry) => Math.max(currentMax, entry.zIndex ?? 1), 1);
    const defaultWidth = fieldFactoryDefaults.width;
    const defaultHeight = fieldFactoryDefaults.height;
    const isOverlapping = (candidateX: number, candidateY: number) =>
      fields.some((entry) => {
        if (entry.page !== safePage) {
          return false;
        }
        const entryRight = entry.x + entry.width;
        const entryBottom = entry.y + entry.height;
        const candidateRight = candidateX + defaultWidth;
        const candidateBottom = candidateY + defaultHeight;
        return !(candidateRight <= entry.x || candidateX >= entryRight || candidateBottom <= entry.y || candidateY >= entryBottom);
      });
    let attempts = 0;
    while (isOverlapping(x, y) && attempts < 20) {
      x = Number(clamp(x + 2, 0, 100 - defaultWidth).toFixed(2));
      y = Number(clamp(y + 2, 0, 100 - defaultHeight).toFixed(2));
      attempts += 1;
    }
    const created: DesignerField = buildDefaultField({
      type: draggedType,
      signerEmail: selectedSignerEmail,
      page: safePage,
      x,
      y,
      zIndex: maxZ + 1,
      label: signatureMode === "DRAW" ? "Draw" : "",
    });
    onAddField(created);
  };

  const applyDragAt = useCallback((clientX: number, clientY: number) => {
    if (!dragState || !(pageSurfaceRef.current || canvasRef.current)) {
      return;
    }
    const pageEl = pageSurfaceRef.current ?? canvasRef.current!;
    const rect = pageEl.getBoundingClientRect();
    const deltaXPercent = ((clientX - dragState.startClientX) / rect.width) * 100;
    const deltaYPercent = ((clientY - dragState.startClientY) / rect.height) * 100;

    if (dragState.mode === "move") {
      for (const index of dragState.selectedIndexes) {
        const startField = dragState.startFieldsByIndex[index];
        if (!startField) {
          continue;
        }
        onUpdateField(index, {
          ...startField,
          x: Number(snapToGrid(clamp(startField.x + deltaXPercent, 0, 100 - startField.width), 1).toFixed(2)),
          y: Number(snapToGrid(clamp(startField.y + deltaYPercent, 0, 100 - startField.height), 1).toFixed(2)),
        });
      }
      return;
    }

    onUpdateField(dragState.index, {
      ...dragState.startField,
      width: Number(
        snapToGrid(
          clamp(dragState.startField.width + deltaXPercent, FIELD_MIN_WIDTH_PERCENT, 100 - dragState.startField.x),
          FIELD_RESIZE_SNAP_PERCENT,
        ).toFixed(2),
      ),
      height: Number(
        snapToGrid(
          clamp(dragState.startField.height + deltaYPercent, FIELD_MIN_HEIGHT_PERCENT, 100 - dragState.startField.y),
          FIELD_RESIZE_SNAP_PERCENT,
        ).toFixed(2),
      ),
    });
  }, [dragState, onUpdateField]);

  const onCanvasMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) {
      return;
    }
    applyDragAt(event.clientX, event.clientY);
  };

  const onCanvasMouseUp = () => {
    if (readOnly) {
      suppressClickRef.current = true;
      setDragState(null);
      return;
    }
    if (dragState) {
      suppressClickRef.current = true;
      setDragState(null);
      onInteractionEnd?.();
    }
  };

  useEffect(() => {
    if (!dragState) {
      return;
    }
    const onWindowMouseMove = (event: MouseEvent) => {
      if (readOnly) {
        return;
      }
      applyDragAt(event.clientX, event.clientY);
    };
    const onWindowMouseUp = () => {
      if (readOnly) {
        suppressClickRef.current = true;
        setDragState(null);
        return;
      }
      suppressClickRef.current = true;
      setDragState(null);
      onInteractionEnd?.();
    };
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [applyDragAt, dragState, onInteractionEnd, readOnly]);

  const resolveValueType = (field: DesignerField): NonNullable<DesignerField["valueType"]> => {
    return inferValueType(field);
  };

  const updateFieldPrefill = (index: number, field: DesignerField, value: string | boolean) => {
    const resolvedType = resolveValueType(field);
    const nextPrefill = typeof value === "boolean" ? (value ? "true" : "false") : value;
    onUpdateField(index, {
      ...field,
      valueType: resolvedType,
      prefillValue: nextPrefill,
    });
  };

  const getWidgetValue = (field: DesignerField): string | boolean => {
    const valueType = inferValueType(field);
    if (valueType === "CHECKBOX") {
      if (field.prefillValue === "true") {
        return true;
      }
      if (field.prefillValue === "false" || field.prefillValue === "") {
        return false;
      }
      return false;
    }
    if (field.prefillValue !== undefined && field.prefillValue !== null) {
      return field.prefillValue;
    }
    return "";
  };

  const onFieldDragStart = (
    event: React.MouseEvent<HTMLElement>,
    index: number,
    field: DesignerField,
    mode: DragState["mode"],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (readOnly) {
      return;
    }
    const selected = mode === "move"
      ? (selectedFieldIndexes.includes(index) ? selectedFieldIndexes : [index])
      : [index];
    const startFieldsByIndex = Object.fromEntries(
      selected
        .map((entryIndex) => {
          const source = fields[entryIndex];
          return source ? [entryIndex, source] : null;
        })
        .filter((entry): entry is [number, DesignerField] => entry !== null),
    );
    setDragState({
      mode,
      index,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startField: field,
      selectedIndexes: selected,
      startFieldsByIndex,
    });
    setSelectedFieldIndexes(selected);
    if (!dragState) {
      onInteractionStart?.();
    }
  };

  const toggleSelect = (event: React.MouseEvent<HTMLElement>, index: number) => {
    event.stopPropagation();
    const multi = event.ctrlKey || event.metaKey;
    if (!multi) {
      setSelectedFieldIndexes([index]);
      return;
    }
    setSelectedFieldIndexes((current) =>
      current.includes(index) ? current.filter((entry) => entry !== index) : [...current, index],
    );
  };

  const paletteItems = paletteVariant === "compact" || paletteVariant === "icon" ? compactPalette : palette;

  return (
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      {/* Upper section: field types and page tools (fixed, does not scroll) */}
      <section
        aria-label="Field placement tools"
        className="shrink-0 rounded-lg border border-border bg-surface shadow-sm"
      >
        <div className="rounded-t-lg border-b border-border bg-muted/40 px-3 py-2">
          {!readOnly ? (
            <p className="text-xs font-medium text-text">Drag a field type onto the document below.</p>
          ) : (
            <p className="text-xs font-medium text-text">Document controls</p>
          )}
        </div>
        <div className="space-y-2 p-3">
      {!readOnly ? (
        <>
          <div className="-mx-0.5 flex gap-1.5 overflow-x-auto pb-0.5 text-xs sm:flex-wrap sm:overflow-visible">
          {paletteItems.map((item) => (
            <button
              key={item.id}
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("application/x-quiksign-field-type", item.type);
                if ("signatureMode" in item && item.signatureMode) {
                  event.dataTransfer.setData("application/x-quiksign-signature-mode", item.signatureMode);
                }
                event.dataTransfer.setData("text/plain", item.type);
                event.dataTransfer.effectAllowed = "copy";
              }}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 ${
                (selectedPaletteKey ? selectedPaletteKey === item.id : selectedFieldType === item.type)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-bg text-text"
              }`}
              title="Drag onto the document"
            >
              {paletteVariant === "icon" ? (
                <span>{item.label}</span>
              ) : (
                <>
                  {"icon" in item ? (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold">
                      {item.icon}
                    </span>
                  ) : null}
                  <span>{paletteVariant === "compact" ? item.label : `Drag ${item.label}`}</span>
                </>
              )}
            </button>
          ))}
          </div>
        </>
      ) : null}
      {minimalViewerChrome && readOnly && showZoomControls ? (
        <div className="mb-2 inline-flex items-center gap-1 rounded border border-border bg-bg px-1 py-0.5 text-xs">
          <button
            type="button"
            onClick={() => setRenderWidth((current) => Math.max(360, current - 80))}
            className="rounded px-2 py-1"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setRenderWidth(760)}
            className="rounded px-2 py-1"
            aria-label="Reset zoom"
          >
            100%
          </button>
          <button
            type="button"
            onClick={() => setRenderWidth((current) => Math.min(1200, current + 80))}
            className="rounded px-2 py-1"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      ) : null}
      {onPlacementPageChange && readOnly ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-1 py-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage <= 1}
              className="rounded px-2 py-1 font-medium text-text hover:bg-surface disabled:opacity-40"
              aria-label="Previous page"
            >
              Prev
            </button>
            <label className="inline-flex items-center gap-1 px-1 text-[11px] text-body">
              Page
              <select
                value={safePage}
                onChange={(event) => goToPage(Number(event.target.value))}
                className="rounded border border-border bg-surface px-1.5 py-0.5 text-text"
                aria-label="Go to page"
              >
                {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNumber) => (
                  <option key={pageNumber} value={pageNumber}>
                    {pageNumber}
                  </option>
                ))}
              </select>
              <span>of {numPages}</span>
            </label>
            <button
              type="button"
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage >= numPages}
              className="rounded px-2 py-1 font-medium text-text hover:bg-surface disabled:opacity-40"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
          <span className="text-[11px] text-muted">Tap a field below or pick a page to find your signature.</span>
        </div>
      ) : null}
      {!minimalViewerChrome ? (
      <div className="flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-1 py-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => goToPage(safePage - 1)}
              disabled={!onPlacementPageChange || safePage <= 1}
              className="rounded px-2 py-1 font-medium disabled:opacity-40"
              aria-label="Previous page"
            >
              Prev
            </button>
            <span className="min-w-[4.5rem] px-1 text-center text-[11px] font-medium text-text">
              {safePage} / {numPages}
            </span>
            <button
              type="button"
              onClick={() => goToPage(safePage + 1)}
              disabled={!onPlacementPageChange || safePage >= numPages}
              className="rounded px-2 py-1 font-medium disabled:opacity-40"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
          <span className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-body">
            {numPages} page{numPages === 1 ? "" : "s"}
          </span>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onUndo()}
              disabled={!canUndo}
              className="rounded-md border border-border px-2 py-1 text-text disabled:opacity-50"
            >
              <span className="hidden sm:inline">Undo </span>
              <span className="text-[11px] text-muted sm:hidden">Undo</span>
              <span className="hidden text-[11px] text-muted sm:inline">(Ctrl/Cmd+Z)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!pageFields.length) {
                  return;
                }
                const confirmed = window.confirm(`Clear ${pageFields.length} field(s) from page ${safePage}?`);
                if (confirmed) {
                  onClearPage(safePage);
                }
              }}
              disabled={pageFields.length === 0}
              className="rounded-md border border-rose-400/70 px-2 py-1 text-rose-600 disabled:opacity-50"
            >
              Clear page
            </button>
          </div>
        ) : null}
        {showZoomControls ? (
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-1 py-0.5 sm:ml-auto">
            <button
              type="button"
              onClick={() => setRenderWidth((current) => Math.max(360, current - 80))}
              className="rounded px-2.5 py-1 disabled:opacity-40"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setRenderWidth(760)}
              className="min-w-[3rem] rounded px-2 py-1 text-[11px]"
              aria-label="Reset zoom"
              title="Reset zoom"
            >
              {Math.round((renderWidth / 760) * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setRenderWidth((current) => Math.min(1200, current + 80))}
              className="rounded px-2.5 py-1 disabled:opacity-40"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-1 py-0.5">
              <button
                type="button"
                onClick={() => setRenderWidth((current) => Math.max(360, current - 80))}
                className="rounded px-2 py-1"
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setRenderWidth(760)}
                className="rounded px-2 py-1 text-[11px]"
                aria-label="Reset zoom"
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => setRenderWidth((current) => Math.min(1200, current + 80))}
                className="rounded px-2 py-1"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
            <label className="hidden items-center gap-1 lg:inline-flex">
              Width
              <input
                type="number"
                min={360}
                max={1200}
                value={renderWidth}
                onChange={(event) => setRenderWidth(Number(event.target.value))}
                className="w-16 rounded border border-border bg-bg px-2 py-1 text-text"
              />
            </label>
          </div>
        )}
        {selectedFieldIndexes.length > 0 && !readOnly ? (
          <p className="w-full text-[11px] text-warning">
            {selectedFieldIndexes.length} selected · Del to remove · Ctrl/Cmd+D duplicate
          </p>
        ) : null}
        {!selectedSignerEmail && !readOnly ? (
          <p className="w-full text-[11px] text-rose-600">Choose a signer first, then place fields on the document.</p>
        ) : null}
        {readOnly ? (
          <span className="text-[11px] text-muted">Preview only</span>
        ) : null}
      </div>
      ) : null}
        </div>
      </section>

      {/* Lower section: fixed-height viewport — scroll inside to see the full PDF page */}
      <section
        aria-label="Document preview"
        className="h-[min(58dvh,560px)] min-h-[320px] shrink-0 overflow-hidden rounded-lg border border-border bg-bg sm:min-h-[400px]"
      >
        <div
          ref={canvasRef}
          onClick={onCanvasClick}
          onDrop={onCanvasDrop}
          onDragOver={(event) => event.preventDefault()}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          className="h-full w-full overflow-x-auto overflow-y-auto overscroll-contain bg-bg"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
        >
        {!documentUrl ? (
          <p className="p-3 text-xs opacity-70">Select a document and provide external auth headers to load PDF preview.</p>
        ) : (
          <div ref={pageSurfaceRef} className="relative mx-auto w-max min-w-0">
            <Document
              file={documentFile}
              onLoadSuccess={(result) => {
                setNumPages(result.numPages);
                onPageBounds?.(result.numPages);
                scrollCanvasToTop();
              }}
              onLoadError={() => {
                onDocumentAccessError?.();
              }}
              onSourceError={() => {
                onDocumentAccessError?.();
              }}
              loading={minimalViewerChrome ? null : <p className="p-3 text-xs">Loading PDF...</p>}
              error={<p className="p-3 text-xs text-rose-500">Unable to render PDF preview.</p>}
            >
              <Page pageNumber={safePage} width={renderWidth} />
            </Document>
            {sortedPageFields.map(({ field, index }) => {
              const senderOnSend = isSenderPlacementField(field, prefillEditingMode);
              const widgetType = resolveValueType(field);
              const sigDisplay =
                widgetType === "SIGNATURE" || widgetType === "STAMP"
                  ? signatureDisplayValue(field.prefillValue ?? String(getWidgetValue(field)))
                  : "";
              const sigIsImage = sigDisplay.length > 0 && isImageLike(sigDisplay);

              return (
              <div
                key={`overlay-${index}-${field.signerEmail}`}
                onClick={(event) => {
                  if (readOnly) {
                    event.stopPropagation();
                    const lockedForSigning =
                      Boolean(signingViewEmail) && isSenderLockedField(field);
                    if (!lockedForSigning) {
                      onReadOnlyFieldClick?.(field, index);
                    }
                    return;
                  }
                  toggleSelect(event, index);
                }}
                onMouseDown={(event) => onFieldDragStart(event, index, field, "move")}
                className="absolute cursor-move rounded"
                role="button"
                tabIndex={0}
                aria-label={`Field ${field.label?.trim() || field.type} for ${field.signerEmail}`}
                onKeyDown={(event) => {
                  const nudgeAmount = event.shiftKey ? 5 : 1;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedFieldIndexes([index]);
                    return;
                  }
                  if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault();
                    onDeleteField(index);
                    return;
                  }
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    onUpdateField(index, nudgeField(field, -nudgeAmount, 0));
                    return;
                  }
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    onUpdateField(index, nudgeField(field, nudgeAmount, 0));
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    onUpdateField(index, nudgeField(field, 0, -nudgeAmount));
                    return;
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    onUpdateField(index, nudgeField(field, 0, nudgeAmount));
                  }
                }}
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                  zIndex: field.zIndex ?? 1,
                  border: senderOnSend
                    ? `1px solid ${selectedFieldIndexes.includes(index) ? "#9ca3af" : "#e5e7eb"}`
                    : `2px solid ${
                        signingViewEmail && isSenderLockedField(field)
                          ? "#b45309"
                          : selectedFieldIndexes.includes(index)
                            ? "#f59e0b"
                            : emailColor(field.signerEmail).border
                      }`,
                  background: senderOnSend
                    ? "transparent"
                    : signingViewEmail && isSenderLockedField(field)
                      ? "rgba(251, 191, 36, 0.12)"
                      : emailColor(field.signerEmail).fill,
                  borderRadius: "8px",
                  boxShadow: senderOnSend
                    ? selectedFieldIndexes.includes(index)
                      ? "0 0 0 2px rgba(156, 163, 175, 0.45)"
                      : "none"
                    : selectedFieldIndexes.includes(index)
                      ? "0 0 0 2px rgba(245,158,11,0.25), 0 8px 18px rgba(15,23,42,0.2)"
                      : "0 4px 12px rgba(15,23,42,0.14)",
                  cursor:
                    readOnly && signingViewEmail && isSenderLockedField(field) ? "default" : undefined,
                }}
              >
                <div
                  className={`h-full w-full p-1.5 ${readOnly && onReadOnlyFieldClick ? "pointer-events-none" : ""}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {prefillEditingMode === "senderOnly" && field.assignedRole !== "SENDER" ? (
                    <div className="flex h-full w-full items-center justify-center rounded-md bg-transparent px-2 text-[11px] font-medium text-text/80">
                      Recipient fills
                    </div>
                  ) : null}
                  {resolveValueType(field) === "TEXT" ? (
                    <input
                      value={String(getWidgetValue(field))}
                      placeholder={field.label?.trim() || "Text"}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        updateFieldPrefill(index, field, nextValue);
                      }}
                      className={`h-full w-full rounded-md bg-transparent px-2 text-[11px] text-text placeholder:text-muted ${
                        prefillEditingMode === "senderOnly" && field.assignedRole !== "SENDER" ? "pointer-events-none opacity-0" : ""
                      }`}
                      readOnly={prefillEditingMode === "senderOnly" && field.assignedRole !== "SENDER"}
                    />
                  ) : null}
                  {resolveValueType(field) === "DATE" ? (
                    <input
                      type="date"
                      value={String(getWidgetValue(field))}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        updateFieldPrefill(index, field, nextValue);
                      }}
                      className={`h-full w-full rounded-md bg-transparent px-2 text-[11px] text-text ${
                        prefillEditingMode === "senderOnly" && field.assignedRole !== "SENDER" ? "pointer-events-none opacity-0" : ""
                      }`}
                      readOnly={prefillEditingMode === "senderOnly" && field.assignedRole !== "SENDER"}
                    />
                  ) : null}
                  {resolveValueType(field) === "CHECKBOX" ? (
                    <label className="flex h-full items-center justify-center rounded-md bg-bg/60">
                      <input
                        type="checkbox"
                        checked={Boolean(getWidgetValue(field))}
                        onChange={(event) => {
                          const nextValue = event.target.checked;
                          updateFieldPrefill(index, field, nextValue);
                        }}
                        disabled={prefillEditingMode === "senderOnly" && field.assignedRole !== "SENDER"}
                      />
                    </label>
                  ) : null}
                  {resolveValueType(field) === "SIGNATURE" || resolveValueType(field) === "STAMP" ? (
                    <div
                      className={`flex h-full w-full items-center justify-center rounded-md bg-transparent p-1 ${
                        prefillEditingMode === "senderOnly" && field.assignedRole !== "SENDER"
                          ? "pointer-events-none opacity-0"
                          : ""
                      }`}
                    >
                      {sigIsImage ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data URLs for drawn signatures
                        <img
                          src={sigDisplay}
                          alt={widgetType === "SIGNATURE" ? "Signature" : "Stamp"}
                          className="max-h-full max-w-full object-contain"
                          draggable={false}
                        />
                      ) : sigDisplay.length > 0 ? (
                        <span
                          className="block max-h-full max-w-full truncate px-1 text-[14px] text-text"
                          style={
                            resolveValueType(field) === "SIGNATURE"
                              ? {
                                  fontFamily:
                                    '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive',
                                  letterSpacing: "0.2px",
                                }
                              : undefined
                          }
                        >
                          {sigDisplay}
                        </span>
                      ) : senderOnSend ? (
                        <span className="text-[10px] text-muted">Add signature in panel</span>
                      ) : resolveValueType(field) === "STAMP" ? (
                        <span className="text-[10px] text-muted">Add stamp in panel</span>
                      ) : (
                        <span className="text-[10px] text-muted">Add signature in panel</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            );
            })}
            {sortedPageFields.map(({ field, index }) => (
              <div
                key={`label-${index}-${field.signerEmail}`}
                onMouseDown={(event) => onFieldDragStart(event, index, field, "move")}
                className={`pointer-events-none absolute rounded px-1 py-0.5 text-[10px] text-white ${fieldLabelMode === "none" ? "hidden" : ""}`}
                style={{
                  left: `${field.x}%`,
                  top: `${Math.max(field.y - 3.4, 0)}%`,
                  background: emailColor(field.signerEmail).label,
                  zIndex: (field.zIndex ?? 1) + 1,
                  borderRadius: "999px",
                  boxShadow: "0 2px 8px rgba(15,23,42,0.2)",
                  fontWeight: 600,
                  letterSpacing: "0.2px",
                }}
                title={field.signerEmail}
              >
                {signingViewEmail
                  ? signingFieldBadge(field, signingViewEmail)
                  : fieldLabelMode === "clean"
                    ? field.label?.trim() || field.type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())
                    : `${field.label?.trim() || field.type} · ${field.signerEmail}`}
              </div>
            ))}
            {selectedOnPage ? (
              <>
                <div
                  className="pointer-events-none absolute border-t border-dashed border-primary/60"
                  style={{
                    left: 0,
                    right: 0,
                    top: `${selectedOnPage.field.y + selectedOnPage.field.height / 2}%`,
                  }}
                />
                <div
                  className="pointer-events-none absolute border-l border-dashed border-primary/60"
                  style={{
                    top: 0,
                    bottom: 0,
                    left: `${selectedOnPage.field.x + selectedOnPage.field.width / 2}%`,
                  }}
                />
              </>
            ) : null}
            {sortedPageFields.map(({ field, index }) => (
              <button
                key={`resize-${index}-${field.signerEmail}`}
                type="button"
                onClick={(event) => {
                  toggleSelect(event, index);
                }}
                onMouseDown={(event) => onFieldDragStart(event, index, field, "resize")}
                className="absolute h-3 w-3 cursor-se-resize rounded-full border border-white/80 shadow-sm"
                aria-label="Resize selected field"
                style={{
                  left: `${field.x + field.width}%`,
                  top: `${field.y + field.height}%`,
                  transform: "translate(-100%, -100%)",
                  background: selectedFieldIndexes.includes(index) ? "#f59e0b" : emailColor(field.signerEmail).label,
                  zIndex: (field.zIndex ?? 1) + 2,
                }}
              />
            ))}
          </div>
        )}
        </div>
      </section>
    </div>
  );
}
