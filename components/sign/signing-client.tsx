"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import dynamic from "next/dynamic";
import type { DesignerField } from "@/components/envelopes/pdf-field-designer";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { canSignerEditField, displayPrefillForSigner } from "@/lib/signing/field-access";
import {
  uiControlClass,
  uiGlassPanelClass,
  uiPrimaryButtonClass,
  uiSecondaryButtonXsClass,
} from "@/lib/ui/classes";
import { X } from "lucide-react";

const PdfFieldDesigner = dynamic(
  () => import("@/components/envelopes/pdf-field-designer").then((module) => module.PdfFieldDesigner),
  { ssr: false, loading: () => <p className="p-3 text-sm text-body">Preparing document preview…</p> },
);

type Signer = {
  id: string;
  name: string;
  email: string;
  status: string;
  role: "SIGNER" | "APPROVER" | "CC";
};

type SignatureField = {
  id: string;
  signerEmail: string;
  signerName?: string;
  label?: string | null;
  required?: boolean;
  readOnly?: boolean;
  prefillValue?: string | null;
  prefilledBySender?: boolean;
  assignedRole?: "SENDER" | "RECIPIENT";
  valueType?: "TEXT" | "DATE" | "CHECKBOX" | "SIGNATURE" | "STAMP";
  zIndex?: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: DesignerField["type"];
};

function toDesignerField(
  field: SignatureField,
  activeSignerEmail: string,
  overrides: Record<string, string>,
): DesignerField {
  const prefill = displayPrefillForSigner(field, activeSignerEmail, overrides);
  const editable = canSignerEditField(field, activeSignerEmail);
  return {
    id: field.id,
    signerEmail: field.signerEmail,
    label: field.label?.trim() || undefined,
    required: field.required ?? true,
    readOnly: !editable,
    prefillValue: prefill,
    prefilledBySender: field.prefilledBySender ?? false,
    assignedRole: field.assignedRole ?? "RECIPIENT",
    valueType:
      field.type === "SIGNATURE" || field.type === "INITIAL"
        ? "SIGNATURE"
        : field.type === "SEAL"
          ? "STAMP"
          : field.type === "DATE"
            ? "DATE"
            : field.type === "CHECKBOX"
              ? "CHECKBOX"
              : field.valueType ?? "TEXT",
    zIndex: field.zIndex ?? 1,
    page: field.page,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    type: field.type,
  };
}

type EnvelopeData = {
  id: string;
  title: string;
  subject?: string | null;
  message?: string | null;
  status?: string;
  documentUrl: string;
  documentFileName?: string | null;
  documentPageCount?: number | null;
  documentConversionMethod?: string | null;
  signedDocumentAvailable?: boolean;
  sentAt?: string | null;
  expiresAt?: string | null;
  senderEmail?: string | null;
  signers: Signer[];
  fields: SignatureField[];
};

type SigningPreset = {
  id: string;
  label: string;
  isDefault: boolean;
  signatureValue: string | null;
  initialValue: string | null;
  sealValue: string | null;
  fontStyle: string | null;
};

const SIGNATURE_FONT_STYLES: { id: string; label: string; font: string }[] = [
  { id: "script", label: "Script", font: '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive' },
  { id: "elegant", label: "Elegant", font: '"Great Vibes", "Snell Roundhand", "Brush Script MT", cursive' },
  { id: "casual", label: "Casual", font: '"Pacifico", "Lucida Handwriting", "Brush Script MT", cursive' },
];

function getDefaultInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 3);
  if (parts.length === 0) return "";
  return parts.map((p) => p[0]!.toUpperCase()).join("");
}

function renderTextToSignatureImage(text: string, fontFamily: string, height = 96): string {
  if (typeof document === "undefined") return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  const measure = document.createElement("canvas");
  const measureCtx = measure.getContext("2d");
  if (!measureCtx) return "";
  const fontSize = Math.round(height * 0.62);
  measureCtx.font = `${fontSize}px ${fontFamily}`;
  const metrics = measureCtx.measureText(trimmed);
  const padding = Math.round(height * 0.18);
  const width = Math.max(Math.ceil(metrics.width) + padding * 2, height * 2);
  const canvas = document.createElement("canvas");
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0f172a";
  ctx.textBaseline = "middle";
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillText(trimmed, padding, height / 2);
  return canvas.toDataURL("image/png");
}

const panelClass = `${uiGlassPanelClass} space-y-3`;
const controlClass = `${uiControlClass} py-2.5 text-[15px]`;
const secondaryButtonClass = uiSecondaryButtonXsClass;
const primaryButtonClass = uiPrimaryButtonClass;
const fileInputClass =
  "mt-2 block w-full cursor-pointer text-sm text-body file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white";

function readUploadImageFile(
  file: File,
  onDataUrl: (dataUrl: string) => void,
  onError: (message: string) => void,
) {
  if (!file.type.startsWith("image/")) {
    onError("Please choose an image file (PNG, JPG, or similar).");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onDataUrl(String(reader.result ?? ""));
  reader.onerror = () => onError("Could not read that image. Try a smaller file.");
  reader.readAsDataURL(file);
}

export function SigningClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [envelope, setEnvelope] = useState<EnvelopeData | null>(null);
  const [activeSigner, setActiveSigner] = useState<Signer | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [workflowClosed, setWorkflowClosed] = useState(false);
  const [signatureType, setSignatureType] = useState<"DRAW" | "TYPE" | "UPLOAD">("TYPE");
  const [signatureValue, setSignatureValue] = useState("");
  const [initialValue, setInitialValue] = useState("");
  const [sealValue, setSealValue] = useState("");
  const [presetLabel, setPresetLabel] = useState("My Default");
  const [presets, setPresets] = useState<SigningPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [presetTouched, setPresetTouched] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [stage, setStage] = useState<"info" | "signing" | "completed">("info");
  const [showMissingFieldsBanner, setShowMissingFieldsBanner] = useState(false);
  const [activeFieldIndex, setActiveFieldIndex] = useState(0);
  const [fillSignatureEverywhere, setFillSignatureEverywhere] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [documentPageCount, setDocumentPageCount] = useState(1);
  const initialFieldPageSetRef = useRef(false);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureModalFocus, setSignatureModalFocus] = useState<"sign" | "seal">("sign");
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [draftSignatureType, setDraftSignatureType] = useState<"DRAW" | "TYPE" | "UPLOAD">("TYPE");
  const [draftSignatureText, setDraftSignatureText] = useState("");
  const [draftInitialText, setDraftInitialText] = useState("");
  const [draftSignatureValue, setDraftSignatureValue] = useState("");
  const [draftInitialValue, setDraftInitialValue] = useState("");
  const [draftSealValue, setDraftSealValue] = useState("");
  const [draftFontStyle, setDraftFontStyle] = useState<string>(SIGNATURE_FONT_STYLES[0]!.id);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [fieldPreviewOverrides, setFieldPreviewOverrides] = useState<Record<string, string>>({});
  const [valueModal, setValueModal] = useState<{ fieldId: string; type: "TEXT" | "DATE" | "CHECKBOX"; draft: string; label: string } | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef<{ target: "sig" | "init" } | null>(null);

  const activeSignerEmail = activeSigner?.email ?? "";

  const myEditableFields = useMemo(() => {
    if (!envelope || !activeSignerEmail) {
      return [];
    }
    return envelope.fields.filter((field) => canSignerEditField(field, activeSignerEmail));
  }, [activeSignerEmail, envelope]);

  const myFieldPages = useMemo(() => {
    const pages = new Set(myEditableFields.map((field) => field.page));
    return [...pages].sort((a, b) => a - b);
  }, [myEditableFields]);

  const myFieldsOrdered = useMemo(
    () =>
      [...myEditableFields].sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page;
        if (Math.abs(a.y - b.y) > 0.5) return a.y - b.y;
        return a.x - b.x;
      }),
    [myEditableFields],
  );

  const completedFieldIds = useMemo(() => {
    const set = new Set<string>();
    for (const field of myFieldsOrdered) {
      if ((fieldPreviewOverrides[field.id] ?? "").trim().length > 0) {
        set.add(field.id);
      }
    }
    return set;
  }, [fieldPreviewOverrides, myFieldsOrdered]);

  const fieldsRemaining = useMemo(
    () => myFieldsOrdered.filter((field) => field.required !== false && !completedFieldIds.has(field.id)).length,
    [completedFieldIds, myFieldsOrdered],
  );

  const fieldsOnWrongPage = useMemo(
    () => myEditableFields.filter((field) => field.page > documentPageCount),
    [documentPageCount, myEditableFields],
  );

  const requiresSignature = myEditableFields.some(
    (field) => field.type === "SIGNATURE" || field.type === "INITIAL",
  );
  const requiresSeal = myEditableFields.some((field) => field.type === "SEAL");

  const documentProxyUrl = useMemo(
    () => `/api/sign/${encodeURIComponent(token)}/file`,
    [token],
  );

  const designerFields = useMemo(() => {
    if (!envelope) {
      return [] as DesignerField[];
    }
    return envelope.fields.map((field) => toDesignerField(field, activeSignerEmail, fieldPreviewOverrides));
  }, [activeSignerEmail, envelope, fieldPreviewOverrides]);

  useEffect(() => {
    initialFieldPageSetRef.current = false;
  }, [token, envelope?.id, activeSignerEmail]);

  const goToPreviewPage = useCallback((page: number) => {
    setPreviewPage(page);
    requestAnimationFrame(() => {
      previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const goToField = useCallback(
    (index: number) => {
      if (myFieldsOrdered.length === 0) return;
      const next = ((index % myFieldsOrdered.length) + myFieldsOrdered.length) % myFieldsOrdered.length;
      setActiveFieldIndex(next);
      const target = myFieldsOrdered[next];
      if (target) {
        goToPreviewPage(target.page);
        setActiveFieldId(target.id);
      }
    },
    [goToPreviewPage, myFieldsOrdered],
  );

  const goToNextRemainingField = useCallback(() => {
    if (myFieldsOrdered.length === 0) return;
    for (let offset = 1; offset <= myFieldsOrdered.length; offset += 1) {
      const candidateIndex = (activeFieldIndex + offset) % myFieldsOrdered.length;
      const candidate = myFieldsOrdered[candidateIndex];
      if (!candidate) continue;
      if (candidate.required !== false && !completedFieldIds.has(candidate.id)) {
        goToField(candidateIndex);
        return;
      }
    }
    goToField((activeFieldIndex + 1) % myFieldsOrdered.length);
  }, [activeFieldIndex, completedFieldIds, goToField, myFieldsOrdered]);

  useEffect(() => {
    if (!envelope || initialFieldPageSetRef.current || myFieldPages.length === 0) {
      return;
    }
    goToPreviewPage(myFieldPages[0]!);
    setFieldPreviewOverrides((current) => {
      const next = { ...current };
      for (const field of myEditableFields) {
        const stored = (field.prefillValue ?? "").trim();
        if (stored && !(field.id in next)) {
          next[field.id] = stored;
        }
      }
      return next;
    });
    initialFieldPageSetRef.current = true;
  }, [envelope, goToPreviewPage, myFieldPages, myEditableFields]);

  const openFieldForSigning = useCallback(
    (field: DesignerField) => {
      if (!activeSignerEmail || !canSignerEditField(field, activeSignerEmail) || !field.id) {
        return;
      }
      setActiveFieldId(field.id);
      if (field.type === "SEAL" || field.valueType === "STAMP") {
        setSignatureModalFocus("seal");
        setDraftSignatureType("UPLOAD");
        setSignatureModalOpen(true);
        return;
      }
      if (field.type === "SIGNATURE" || field.type === "INITIAL") {
        setSignatureModalFocus("sign");
        setSignatureModalOpen(true);
        return;
      }
      if (field.type === "CHECKBOX") {
        setFieldPreviewOverrides((current) => {
          const existing = (current[field.id!] ?? "").toLowerCase();
          return { ...current, [field.id!]: existing === "true" ? "false" : "true" };
        });
        return;
      }
      const inferredType: "TEXT" | "DATE" =
        field.type === "DATE" || field.valueType === "DATE" ? "DATE" : "TEXT";
      setValueModal({
        fieldId: field.id,
        type: inferredType,
        draft: fieldPreviewOverrides[field.id] ?? "",
        label:
          field.label?.trim() ||
          field.type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()),
      });
    },
    [activeSignerEmail, fieldPreviewOverrides],
  );

  const isImageLikeValue = useCallback((value: string): boolean => {
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
  }, []);

  useEffect(() => {
    if (!signatureModalOpen) return;
    queueMicrotask(() => {
      const incomingSignatureValue = signatureValue;
      const incomingIsImage = isImageLikeValue(incomingSignatureValue);
      const nextType =
        signatureModalFocus === "seal"
          ? "UPLOAD"
          : signatureType === "TYPE" && incomingIsImage
            ? "DRAW"
            : signatureType === "UPLOAD"
              ? "UPLOAD"
              : signatureType;

      setDraftSignatureType(nextType);
      setDraftSignatureValue(incomingSignatureValue);
      setDraftInitialValue(initialValue);
      setDraftSealValue(sealValue);
      const presetMatch = presets.find((p) => p.isDefault) ?? presets[0];
      const fallbackName = (activeSigner?.name ?? "").trim();
      const fallbackInitials = getDefaultInitials(activeSigner?.name ?? "");
      setDraftSignatureText((current) => current || fallbackName);
      setDraftInitialText((current) => current || fallbackInitials);
      if (presetMatch?.fontStyle) {
        setDraftFontStyle(presetMatch.fontStyle);
      }
    });
  }, [
    activeSigner?.name,
    initialValue,
    isImageLikeValue,
    presets,
    sealValue,
    signatureModalFocus,
    signatureModalOpen,
    signatureType,
    signatureValue,
  ]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/sign/${token}`);
        const data = (await response.json()) as {
          error?: string;
          envelope?: EnvelopeData;
          activeSigner?: Signer;
          status?: string;
          signedDocumentAvailable?: boolean;
        };
        if (!response.ok) {
          if (response.status === 409) {
            setWorkflowClosed(true);
            if (data.status === "COMPLETED") {
              setStage("completed");
              setEnvelope((current) =>
                current ?? ({
                  id: "",
                  title: "",
                  status: "COMPLETED",
                  documentUrl: "",
                  signedDocumentAvailable: Boolean(data.signedDocumentAvailable),
                  signers: [],
                  fields: [],
                } as unknown as EnvelopeData),
              );
            }
          }
          throw new Error(mapApiErrorMessage(data.error ?? "Unable to load signing session"));
        }
        setEnvelope(data.envelope ?? null);
        setActiveSigner(data.activeSigner ?? null);
      } catch (error) {
        setStatusMessage(mapApiErrorMessage((error as Error).message));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  useEffect(() => {
    const loadPresets = async () => {
      try {
        const response = await fetch(`/api/sign/presets?token=${encodeURIComponent(token)}`);
        const data = (await response.json()) as { presets?: SigningPreset[]; error?: string };
        if (!response.ok) {
          throw new Error(mapApiErrorMessage(data.error ?? "Unable to load signing presets"));
        }
        const nextPresets = data.presets ?? [];
        setPresets(nextPresets);
        if (!presetTouched && nextPresets.length > 0) {
          const defaultPreset = nextPresets.find((preset) => preset.isDefault) ?? nextPresets[0];
          setSelectedPresetId(defaultPreset.id);
          if (defaultPreset.signatureValue) {
            setSignatureValue(defaultPreset.signatureValue);
          }
          if (defaultPreset.initialValue) {
            setInitialValue(defaultPreset.initialValue);
          }
          if (defaultPreset.sealValue) {
            setSealValue(defaultPreset.sealValue);
          }
          if (defaultPreset.fontStyle) {
            setDraftFontStyle(defaultPreset.fontStyle);
          }
          setPresetLabel(defaultPreset.label);
          setPresetTouched(true);
        }
      } catch {
        setPresets([]);
      }
    };
    void loadPresets();
  }, [presetTouched, token]);

  const autoSavePreset = useCallback(
    async (input: { signature?: string; initial?: string; seal?: string; font?: string }) => {
      try {
        const label = (activeSigner?.name?.trim() || "My Default").slice(0, 80);
        const body: Record<string, unknown> = { token, label };
        if (input.signature?.trim()) body.signatureValue = input.signature.trim();
        if (input.initial?.trim()) body.initialValue = input.initial.trim();
        if (input.seal?.trim()) body.sealValue = input.seal.trim();
        if (input.font?.trim()) body.fontStyle = input.font.trim();
        if (!body.signatureValue && !body.initialValue && !body.sealValue) return;
        const response = await fetch("/api/sign/presets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) return;
        const data = (await response.json()) as { preset?: SigningPreset };
        if (data.preset) {
          setPresets((current) => {
            const withoutCurrent = current.filter((entry) => entry.id !== data.preset!.id);
            return [data.preset!, ...withoutCurrent];
          });
          setSelectedPresetId(data.preset.id);
          setPresetLabel(data.preset.label);
        }
      } catch {
        // best-effort save; ignore failures
      }
    },
    [activeSigner, token],
  );

  const submitSign = async () => {
    if (!consentAccepted) {
      setStatusMessage("Please agree to the Electronic Record and Signature Disclosure before finishing.");
      return;
    }
    if (fieldsRemaining > 0) {
      setShowMissingFieldsBanner(true);
      setStatusMessage("");
      goToNextRemainingField();
      return;
    }
    setSubmitting(true);
    setStatusMessage("");
    try {
      const fieldValues = myEditableFields
        .filter((field) => (fieldPreviewOverrides[field.id] ?? "").trim().length > 0)
        .map((field) => ({ fieldId: field.id, value: fieldPreviewOverrides[field.id]!.trim() }));

      const response = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          signatureType,
          signatureValue: signatureValue || (fieldValues.find((entry) => entry.value)?.value ?? ""),
          initialValue: initialValue || undefined,
          sealValue: sealValue || undefined,
          consentAccepted,
          fieldValues,
        }),
      });
      const data = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) {
        if (response.status === 409) {
          setWorkflowClosed(true);
        }
        throw new Error(mapApiErrorMessage(data.error ?? "Sign failed"));
      }
      setStatusMessage("");
      setStage("completed");
    } catch (error) {
      setStatusMessage(mapApiErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  const submitDecline = async () => {
    setSubmitting(true);
    setStatusMessage("");
    try {
      const response = await fetch("/api/sign/decline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          reason: declineReason,
        }),
      });
      const data = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) {
        if (response.status === 409) {
          setWorkflowClosed(true);
        }
        throw new Error(mapApiErrorMessage(data.error ?? "Decline failed"));
      }
      setStatusMessage("You declined this envelope. Sender has been notified.");
      setWorkflowClosed(true);
    } catch (error) {
      setStatusMessage(mapApiErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  const submitApprove = async () => {
    setSubmitting(true);
    setStatusMessage("");
    try {
      const response = await fetch("/api/sign/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          note: approvalNote || undefined,
        }),
      });
      const data = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) {
        if (response.status === 409) {
          setWorkflowClosed(true);
        }
        throw new Error(mapApiErrorMessage(data.error ?? "Approval failed"));
      }
      setStatusMessage("Approved successfully. Workflow advanced.");
      setWorkflowClosed(true);
    } catch (error) {
      setStatusMessage(mapApiErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  const getDrawTargetCanvas = (target: "sig" | "init") =>
    target === "sig" ? signatureCanvasRef.current : initialCanvasRef.current;

  const beginSignatureDrawing = (target: "sig" | "init", clientX: number, clientY: number) => {
    const canvas = getDrawTargetCanvas(target);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context) return;
    signatureDrawingRef.current = { target };
    context.lineWidth = 1.8;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
    context.beginPath();
    context.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const continueSignatureDrawing = (target: "sig" | "init", clientX: number, clientY: number) => {
    if (!signatureDrawingRef.current || signatureDrawingRef.current.target !== target) return;
    const canvas = getDrawTargetCanvas(target);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineTo(clientX - rect.left, clientY - rect.top);
    context.stroke();
  };

  const endSignatureDrawing = (target: "sig" | "init") => {
    if (!signatureDrawingRef.current || signatureDrawingRef.current.target !== target) return;
    signatureDrawingRef.current = null;
    const dataUrl = getDrawTargetCanvas(target)?.toDataURL("image/png") ?? "";
    if (!dataUrl) return;
    if (target === "sig") setDraftSignatureValue(dataUrl);
    else setDraftInitialValue(dataUrl);
  };

  const clearSignatureDrawing = (target: "sig" | "init") => {
    const canvas = getDrawTargetCanvas(target);
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (target === "sig") setDraftSignatureValue("");
    else setDraftInitialValue("");
  };

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className={panelClass}>
          <div className="h-5 w-40 animate-pulse rounded bg-bg" />
          <div className="mt-3 h-9 w-3/5 animate-pulse rounded bg-bg" />
          <div className="mt-2 h-4 w-full animate-pulse rounded bg-bg" />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="h-12 animate-pulse rounded bg-bg" />
            <div className="h-12 animate-pulse rounded bg-bg" />
          </div>
        </div>
        <p className="text-center text-xs text-muted">Loading signing session…</p>
      </div>
    );
  }

  if (!envelope) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className={panelClass}>
          <p className="text-sm font-semibold text-text">Invalid signing session</p>
          <p className="mt-1 text-xs text-body">
            {statusMessage ||
              "This link is no longer valid. Ask the sender to resend the signing invitation."}
          </p>
        </div>
      </div>
    );
  }

  const formatLongDate = (raw?: string | null) => {
    if (!raw) return "";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };

  if (stage === "info" && !workflowClosed) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className={panelClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-label uppercase">You&apos;ve been invited to sign</p>
              <h1 className="mt-1 truncate text-2xl font-semibold text-text">{envelope.title}</h1>
              <p className="mt-1 text-sm text-body">
                Review the agreement, place your signature where required, and submit. The sender will
                be notified the moment you finish.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {myFieldsOrdered.length} field{myFieldsOrdered.length === 1 ? "" : "s"} for you
            </span>
          </div>

          <dl className="mt-5 grid gap-3 text-sm text-body sm:grid-cols-[140px_1fr]">
            <dt className="text-muted">Sender</dt>
            <dd className="text-text">{envelope.senderEmail ?? "Sender"}</dd>
            <dt className="text-muted">Active signer</dt>
            <dd className="text-text">
              {activeSigner?.name ?? "Unknown"} · {activeSigner?.email ?? ""}
            </dd>
            {envelope.subject ? (
              <>
                <dt className="text-muted">Subject</dt>
                <dd className="text-text">{envelope.subject}</dd>
              </>
            ) : null}
            {envelope.message ? (
              <>
                <dt className="text-muted">Message</dt>
                <dd className="whitespace-pre-line text-text">{envelope.message}</dd>
              </>
            ) : null}
            {envelope.sentAt ? (
              <>
                <dt className="text-muted">Sent on</dt>
                <dd className="text-text">{formatLongDate(envelope.sentAt)}</dd>
              </>
            ) : null}
            {envelope.expiresAt ? (
              <>
                <dt className="text-muted">Expires on</dt>
                <dd className="text-text">{formatLongDate(envelope.expiresAt)}</dd>
              </>
            ) : null}
            <dt className="text-muted">Pages</dt>
            <dd className="text-text">
              {envelope.documentPageCount ?? documentPageCount} page
              {(envelope.documentPageCount ?? documentPageCount) === 1 ? "" : "s"}
            </dd>
          </dl>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setDeclineModalOpen(true)}
              className="rounded-xl border border-rose-300/60 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-500/20 dark:text-rose-300"
            >
              Decline to sign
            </button>
            <button
              type="button"
              onClick={() => setStage("signing")}
              className={`${primaryButtonClass} min-w-56 justify-center`}
            >
              Proceed to document
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "completed") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 className="text-heading text-2xl">You have signed this document.</h2>
        <p className="text-sm text-body">The next signer (if any) has been notified. Keep a copy for your records.</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {envelope.senderEmail ? (
            <a
              href={`mailto:${envelope.senderEmail}?subject=${encodeURIComponent(`Signed: ${envelope.title}`)}`}
              className={secondaryButtonClass}
            >
              Email sender
            </a>
          ) : null}
          <a
            href={`/api/sign/${encodeURIComponent(token)}/download`}
            target="_blank"
            rel="noreferrer"
            className={secondaryButtonClass}
          >
            Print / View signed PDF
          </a>
          <a
            href={`/api/sign/${encodeURIComponent(token)}/download`}
            className={primaryButtonClass}
          >
            Download signed PDF
          </a>
        </div>
        {statusMessage ? (
          <p className="mt-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-body">{statusMessage}</p>
        ) : null}
      </div>
    );
  }

  const isApprover = activeSigner?.role === "APPROVER";
  const finishLabel = isApprover ? "Approve" : "Finish signing";

  const clickedFieldForModal = activeFieldId
    ? envelope.fields.find((field) => field.id === activeFieldId)
    : undefined;

  const signatureOkRequired =
    signatureModalFocus === "sign" &&
    requiresSignature &&
    (fillSignatureEverywhere ||
      !clickedFieldForModal ||
      clickedFieldForModal.type === "SIGNATURE" ||
      clickedFieldForModal.type === "INITIAL");

  const sealOkRequired =
    requiresSeal &&
    (signatureModalFocus === "seal" ||
      fillSignatureEverywhere ||
      !clickedFieldForModal ||
      clickedFieldForModal.type === "SEAL");

  const hasSignatureInput =
    draftSignatureType === "TYPE"
      ? draftSignatureText.trim().length > 0 || draftInitialText.trim().length > 0
      : isImageLikeValue(draftSignatureValue) || isImageLikeValue(draftInitialValue);

  const signatureModalOkDisabled =
    (signatureOkRequired && !hasSignatureInput) || (sealOkRequired && draftSealValue.trim().length === 0);

  return (
    <div className="flex min-h-[calc(100dvh-var(--app-header-height)-2rem)] flex-col gap-3 pb-28">
      {workflowClosed ? (
        <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-body">
          This document is closed. You cannot sign or decline again.
        </div>
      ) : null}

      {statusMessage ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-body">{statusMessage}</p>
      ) : null}

      {showMissingFieldsBanner && fieldsRemaining > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          <span>Tap each highlighted field on the document to complete it.</span>
          <button
            type="button"
            onClick={() => setShowMissingFieldsBanner(false)}
            aria-label="Dismiss"
            className="rounded p-1 hover:bg-amber-500/20"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {fieldsOnWrongPage.length > 0 ? (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Some fields reference pages not shown in preview. Use Download to view the full PDF.
        </div>
      ) : null}

      <div ref={previewSectionRef} className={clsx(panelClass, "min-w-0 flex-1")}>
        {!consentAccepted && !workflowClosed ? (
          <p className="mb-3 text-sm text-body">
            Scroll through the document below. Agree to sign at the bottom, then tap each field on the page to fill it.
          </p>
        ) : fieldsRemaining > 0 && !isApprover ? (
          <p className="mb-3 text-sm text-muted">Tap the highlighted fields on the document to sign or enter information.</p>
        ) : null}
        <PdfFieldDesigner
          readOnly
          minimalViewerChrome
          showZoomControls
          fieldLabelMode="clean"
          signingViewEmail={activeSignerEmail}
          documentUrl={documentProxyUrl}
          selectedSignerEmail={activeSignerEmail}
          placementPage={previewPage}
          fields={designerFields}
          selectedFieldType={"SIGNATURE"}
          onAddField={() => {}}
          onUpdateField={() => {}}
          onDeleteField={() => {}}
          onClearPage={() => {}}
          onUndo={() => {}}
          canUndo={false}
          onReadOnlyFieldClick={openFieldForSigning}
          onPlacementPageChange={goToPreviewPage}
          onPageBounds={(numPages) => {
            setDocumentPageCount(numPages);
            if (previewPage > numPages) {
              goToPreviewPage(numPages);
            }
          }}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-md dark:bg-surface/90">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
          {isApprover ? (
            <label className="block text-sm text-body">
              Note (optional)
              <textarea
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
                placeholder="Optional message to sender"
                rows={2}
                className={`${controlClass} mt-1`}
              />
            </label>
          ) : (
            <label className="flex items-start gap-2 text-xs text-body sm:text-sm">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => setConsentAccepted(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                I agree to sign electronically and accept the{" "}
                <button
                  type="button"
                  onClick={() => setDisclosureOpen(true)}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  disclosure
                </button>
                .
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-text">{envelope.title}</p>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={documentProxyUrl}
                target="_blank"
                rel="noreferrer"
                className={`${secondaryButtonClass} hidden text-xs sm:inline-flex`}
              >
                Download
              </a>
              <button
                type="button"
                onClick={() => setDeclineModalOpen(true)}
                disabled={workflowClosed}
                className="rounded-lg border border-rose-300/60 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
              >
                Decline
              </button>
              {isApprover ? (
                <button
                  type="button"
                  onClick={submitApprove}
                  disabled={submitting || workflowClosed}
                  className={`${primaryButtonClass} py-2`}
                >
                  {submitting ? "Submitting…" : finishLabel}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submitSign}
                  disabled={submitting || workflowClosed || !consentAccepted}
                  className={`${primaryButtonClass} py-2`}
                >
                  {submitting ? "Submitting…" : finishLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {disclosureOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text">Terms and conditions</h3>
              <button type="button" onClick={() => setDisclosureOpen(false)} className={secondaryButtonClass}>
                Close
              </button>
            </div>
            <div className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto text-sm text-body">
              <p className="font-semibold text-text">ELECTRONIC RECORD AND SIGNATURE DISCLOSURE</p>
              <p>
                By clicking the &quot;Agree&quot; button, you agree that you have reviewed the following terms and consent
                to transact business electronically using QuikSign. If you do not agree to these terms, please do not
                click the &quot;Agree&quot; button.
              </p>
              <p className="font-semibold text-text">Electronic documents</p>
              <p>
                The sender will deliver documents electronically to the email address you provided. Once signed, a PDF
                copy of the executed document will be made available to you.
              </p>
              <p className="font-semibold text-text">Request for paper copies</p>
              <p>
                You have the right to request paper copies of these documents. You may also download and print the
                signed document at any time after completion.
              </p>
              <p className="font-semibold text-text">Withdrawing consent</p>
              <p>
                At any point in this session you may decline to sign and notify the sender. After signing, contact the
                sender directly to withdraw or revise the agreement.
              </p>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDisclosureOpen(false)} className={secondaryButtonClass}>
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setConsentAccepted(true);
                  setDisclosureOpen(false);
                  goToNextRemainingField();
                }}
                className={primaryButtonClass}
              >
                Agree
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {valueModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text">{valueModal.label}</h3>
              <button type="button" onClick={() => setValueModal(null)} className={secondaryButtonClass}>
                Close
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {valueModal.type === "DATE" ? (
                <input
                  type="date"
                  value={valueModal.draft}
                  onChange={(event) => setValueModal({ ...valueModal, draft: event.target.value })}
                  className={controlClass}
                />
              ) : (
                <textarea
                  value={valueModal.draft}
                  onChange={(event) => setValueModal({ ...valueModal, draft: event.target.value })}
                  placeholder={`Type ${valueModal.label.toLowerCase()}`}
                  rows={3}
                  className={controlClass}
                />
              )}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setValueModal(null)} className={secondaryButtonClass}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFieldPreviewOverrides((current) => ({ ...current, [valueModal.fieldId]: valueModal.draft }));
                    setValueModal(null);
                    requestAnimationFrame(() => goToNextRemainingField());
                  }}
                  disabled={valueModal.draft.trim().length === 0}
                  className={primaryButtonClass}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {signatureModalOpen && activeSigner?.role !== "APPROVER" ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
            <div className="flex items-center gap-4 border-b border-border px-5 py-4">
              {signatureModalFocus === "sign" ? (
                [
                  { id: "TYPE" as const, label: "TYPE" },
                  { id: "DRAW" as const, label: "DRAW" },
                  { id: "UPLOAD" as const, label: "UPLOAD" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDraftSignatureType(tab.id)}
                    className={`-mb-px border-b-2 px-2 pb-1 text-[11px] font-semibold tracking-wider transition ${
                      draftSignatureType === tab.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted hover:text-text"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))
              ) : (
                <h3 className="text-base font-semibold text-text">Upload stamp</h3>
              )}
              <button
                type="button"
                onClick={() => setSignatureModalOpen(false)}
                aria-label="Close"
                className="ml-auto text-muted transition hover:text-text"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
              {signatureModalFocus === "seal" ? (
                <div className="space-y-4">
                  <p className="text-sm text-body">Choose a stamp image (PNG or JPG). It will be placed on the stamp field you selected.</p>
                  <label className="block rounded-xl border border-border bg-bg p-4 text-sm text-body">
                    <span className="font-medium text-text">Stamp image</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        readUploadImageFile(
                          file,
                          (dataUrl) => setDraftSealValue(dataUrl),
                          (message) => setStatusMessage(message),
                        );
                        event.currentTarget.value = "";
                      }}
                      className={fileInputClass}
                    />
                    {draftSealValue && isImageLikeValue(draftSealValue) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draftSealValue}
                        alt="Stamp preview"
                        className="mx-auto mt-4 max-h-32 rounded border border-border bg-white object-contain p-2"
                      />
                    ) : null}
                  </label>
                </div>
              ) : null}

              {signatureModalFocus === "sign" ? (
              <>
              {draftSignatureType === "TYPE" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm text-body">
                      <span className="mb-1 block text-xs font-medium text-text">Signature</span>
                      <input
                        value={draftSignatureText}
                        onChange={(event) => setDraftSignatureText(event.target.value)}
                        placeholder="Type your name"
                        className={controlClass}
                      />
                    </label>
                    <label className="block text-sm text-body">
                      <span className="mb-1 block text-xs font-medium text-text">Initial</span>
                      <input
                        value={draftInitialText}
                        onChange={(event) => setDraftInitialText(event.target.value)}
                        placeholder="e.g. AG"
                        className={controlClass}
                      />
                    </label>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border">
                    {SIGNATURE_FONT_STYLES.map((option, index) => {
                      const selected = draftFontStyle === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setDraftFontStyle(option.id)}
                          className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition last:border-b-0 ${
                            selected ? "bg-emerald-50/70 dark:bg-emerald-500/10" : "bg-bg hover:bg-surface"
                          }`}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center text-emerald-600 ${selected ? "opacity-100" : "opacity-0"}`} aria-hidden>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                          </span>
                          <span className="flex-1 truncate text-2xl leading-tight text-text" style={{ fontFamily: option.font }}>
                            {draftSignatureText.trim() || activeSigner?.name || "Your signature"}
                          </span>
                          <span className="w-20 shrink-0 text-right text-2xl text-text" style={{ fontFamily: option.font }}>
                            {draftInitialText.trim() || getDefaultInitials(activeSigner?.name ?? "")}
                          </span>
                          {/* hidden index for screen readers */}
                          <span className="sr-only">Style {index + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {draftSignatureType === "DRAW" ? (
                <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                  <div className="rounded-xl border border-border bg-bg p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-medium text-text">Signature</p>
                      <button type="button" onClick={() => clearSignatureDrawing("sig")} className="text-[11px] text-muted hover:text-text">
                        Clear
                      </button>
                    </div>
                    <canvas
                      ref={signatureCanvasRef}
                      width={520}
                      height={150}
                      className="w-full touch-none rounded border border-border bg-surface"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        beginSignatureDrawing("sig", event.clientX, event.clientY);
                      }}
                      onPointerMove={(event) => {
                        event.preventDefault();
                        continueSignatureDrawing("sig", event.clientX, event.clientY);
                      }}
                      onPointerUp={(event) => {
                        event.preventDefault();
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        }
                        endSignatureDrawing("sig");
                      }}
                      onPointerLeave={() => endSignatureDrawing("sig")}
                      onPointerCancel={() => endSignatureDrawing("sig")}
                    />
                  </div>
                  <div className="rounded-xl border border-border bg-bg p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-medium text-text">Initial</p>
                      <button type="button" onClick={() => clearSignatureDrawing("init")} className="text-[11px] text-muted hover:text-text">
                        Clear
                      </button>
                    </div>
                    <canvas
                      ref={initialCanvasRef}
                      width={220}
                      height={150}
                      className="w-full touch-none rounded border border-border bg-surface"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        beginSignatureDrawing("init", event.clientX, event.clientY);
                      }}
                      onPointerMove={(event) => {
                        event.preventDefault();
                        continueSignatureDrawing("init", event.clientX, event.clientY);
                      }}
                      onPointerUp={(event) => {
                        event.preventDefault();
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        }
                        endSignatureDrawing("init");
                      }}
                      onPointerLeave={() => endSignatureDrawing("init")}
                      onPointerCancel={() => endSignatureDrawing("init")}
                    />
                  </div>
                </div>
              ) : null}

              {draftSignatureType === "UPLOAD" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="rounded-xl border border-border bg-bg p-3 text-sm text-body">
                    <span className="mb-2 block text-xs font-medium text-text">Signature image</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        readUploadImageFile(
                          file,
                          (dataUrl) => setDraftSignatureValue(dataUrl),
                          (message) => setStatusMessage(message),
                        );
                        event.currentTarget.value = "";
                      }}
                      className={fileInputClass}
                    />
                    {draftSignatureValue && isImageLikeValue(draftSignatureValue) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draftSignatureValue} alt="signature preview" className="mt-3 max-h-24 rounded border border-border bg-white object-contain p-2" />
                    ) : null}
                  </label>
                  <label className="rounded-xl border border-border bg-bg p-3 text-sm text-body">
                    <span className="mb-2 block text-xs font-medium text-text">Initial image (optional)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        readUploadImageFile(
                          file,
                          (dataUrl) => setDraftInitialValue(dataUrl),
                          (message) => setStatusMessage(message),
                        );
                        event.currentTarget.value = "";
                      }}
                      className={fileInputClass}
                    />
                    {draftInitialValue && isImageLikeValue(draftInitialValue) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draftInitialValue} alt="initial preview" className="mt-3 max-h-24 rounded border border-border bg-white object-contain p-2" />
                    ) : null}
                  </label>
                </div>
              ) : null}

              {requiresSeal && signatureModalFocus === "sign" ? (
                <div className="mt-4 rounded-xl border border-border bg-bg p-4">
                  <p className="text-sm font-semibold text-text">Stamp</p>
                  <p className="mt-1 text-xs text-muted">Upload a stamp image if this document includes stamp fields.</p>
                  <label className="mt-3 block text-sm text-body">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        readUploadImageFile(
                          file,
                          (dataUrl) => setDraftSealValue(dataUrl),
                          (message) => setStatusMessage(message),
                        );
                        event.currentTarget.value = "";
                      }}
                      className={fileInputClass}
                    />
                    {draftSealValue && isImageLikeValue(draftSealValue) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draftSealValue} alt="stamp preview" className="mt-3 max-h-24 rounded border border-border bg-white object-contain p-2" />
                    ) : null}
                  </label>
                </div>
              ) : null}
              </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg/40 px-5 py-3">
              {signatureModalFocus === "sign" ? (
                <label className="flex items-center gap-2 text-xs text-body">
                  <input
                    type="checkbox"
                    checked={fillSignatureEverywhere}
                    onChange={(event) => setFillSignatureEverywhere(event.target.checked)}
                  />
                  Fill signature in all signature fields
                </label>
              ) : (
                <span className="text-xs text-muted" />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSignatureModalOpen(false)}
                  className={secondaryButtonClass}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const fontConfig = SIGNATURE_FONT_STYLES.find((style) => style.id === draftFontStyle) ?? SIGNATURE_FONT_STYLES[0]!;
                    let nextSignature = draftSignatureValue;
                    let nextInitial = draftInitialValue;
                    if (draftSignatureType === "TYPE") {
                      nextSignature = renderTextToSignatureImage(draftSignatureText, fontConfig.font, 110);
                      nextInitial = renderTextToSignatureImage(
                        draftInitialText || getDefaultInitials(activeSigner?.name ?? ""),
                        fontConfig.font,
                        110,
                      );
                    }
                    setSignatureType(draftSignatureType);
                    setSignatureValue(nextSignature);
                    setInitialValue(nextInitial);
                    setSealValue(draftSealValue);

                    setFieldPreviewOverrides((current) => {
                      const next = { ...current };
                      const clicked = activeFieldId
                        ? envelope.fields.find((f) => f.id === activeFieldId)
                        : undefined;
                      const applyEverywhere = fillSignatureEverywhere || !clicked;

                      const valueForType = (fieldType: SignatureField["type"]): string => {
                        if (fieldType === "INITIAL") return (nextInitial || nextSignature).trim();
                        if (fieldType === "SIGNATURE") return (nextSignature || nextInitial).trim();
                        if (fieldType === "SEAL") return draftSealValue.trim();
                        return "";
                      };

                      if (clicked && canSignerEditField(clicked, activeSignerEmail) && !applyEverywhere) {
                        const val = valueForType(clicked.type);
                        if (val) next[clicked.id] = val;
                      } else {
                        for (const f of envelope.fields) {
                          if (!canSignerEditField(f, activeSignerEmail)) continue;
                          const val = valueForType(f.type);
                          if (val) next[f.id] = val;
                        }
                      }
                      return next;
                    });

                    setSignatureModalOpen(false);
                    requestAnimationFrame(() => goToNextRemainingField());

                    void autoSavePreset({
                      signature: nextSignature,
                      initial: nextInitial,
                      seal: draftSealValue,
                      font: draftFontStyle,
                    });
                  }}
                  disabled={signatureModalOkDisabled}
                  className={`${primaryButtonClass} min-w-16 justify-center`}
                >
                  Ok
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {declineModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-text">Decline Action</h3>
              <button type="button" onClick={() => setDeclineModalOpen(false)} className={secondaryButtonClass}>
                Close
              </button>
            </div>
            <div className="mt-3 space-y-3">
              <textarea
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
                placeholder="Reason for declining this envelope"
                rows={4}
                className={controlClass}
              />
              <button
                disabled={submitting || workflowClosed || declineReason.trim().length < 3}
                onClick={submitDecline}
                className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:opacity-60"
              >
                Decline Envelope
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {statusMessage ? (
        <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text">
          {statusMessage}
        </div>
      ) : null}
    </div>
  );
}
