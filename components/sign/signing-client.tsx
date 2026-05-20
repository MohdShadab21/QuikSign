"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import dynamic from "next/dynamic";
import type { DesignerField } from "@/components/envelopes/pdf-field-designer";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import {
  canSignerEditField,
  displayPrefillForSigner,
  isSenderLockedField,
  signingFieldBadge,
} from "@/lib/signing/field-access";
import {
  uiControlClass,
  uiGlassMutedPanelClass,
  uiGlassPanelClass,
  uiPrimaryButtonClass,
  uiSecondaryButtonXsClass,
} from "@/lib/ui/classes";
import { builderSplitGridClass } from "@/lib/ui/layout";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

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
const mutedCardClass = uiGlassMutedPanelClass;
const secondaryButtonClass = uiSecondaryButtonXsClass;
const primaryButtonClass = uiPrimaryButtonClass;

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
  const [showPresetTools, setShowPresetTools] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
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

  const activeField = myFieldsOrdered[activeFieldIndex] ?? null;

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      if (isTypingTarget || signatureModalOpen || declineModalOpen) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goToPreviewPage(Math.max(1, previewPage - 1));
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goToPreviewPage(Math.min(documentPageCount, previewPage + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [declineModalOpen, documentPageCount, goToPreviewPage, previewPage, signatureModalOpen]);

  const openFieldForSigning = useCallback(
    (field: DesignerField) => {
      if (!activeSignerEmail || !canSignerEditField(field, activeSignerEmail) || !field.id) {
        return;
      }
      setActiveFieldId(field.id);
      if (field.type === "SEAL" || field.valueType === "STAMP") {
        setSignatureType("UPLOAD");
        setSignatureModalOpen(true);
        return;
      }
      if (field.type === "SIGNATURE" || field.type === "INITIAL") {
        setSignatureType((current) => (current === "UPLOAD" ? "TYPE" : current));
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
        signatureType === "TYPE" && incomingIsImage ? "DRAW" : signatureType === "UPLOAD" && !incomingIsImage ? "TYPE" : signatureType;

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
  }, [activeSigner?.name, initialValue, isImageLikeValue, presets, sealValue, signatureModalOpen, signatureType, signatureValue]);

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

  const applyPreset = () => {
    const preset = presets.find((entry) => entry.id === selectedPresetId);
    if (!preset) {
      return;
    }
    if (preset.signatureValue) {
      setSignatureValue(preset.signatureValue);
      setDraftSignatureValue(preset.signatureValue);
    }
    if (preset.initialValue) {
      setInitialValue(preset.initialValue);
      setDraftInitialValue(preset.initialValue);
    }
    if (preset.sealValue) {
      setSealValue(preset.sealValue);
      setDraftSealValue(preset.sealValue);
    }
    if (preset.fontStyle) {
      setDraftFontStyle(preset.fontStyle);
    }
    setPresetLabel(preset.label);
    setStatusMessage(`Preset "${preset.label}" applied.`);
    setPresetTouched(true);
  };

  const savePreset = async () => {
    if (!signatureValue.trim() && !initialValue.trim() && !sealValue.trim()) {
      setStatusMessage("Add a signature, initial, or stamp before saving a preset.");
      return;
    }
    setSubmitting(true);
    setStatusMessage("");
    try {
      const response = await fetch("/api/sign/presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          label: presetLabel.trim() || "My Default",
          signatureValue: signatureValue || undefined,
          initialValue: initialValue || undefined,
          sealValue: sealValue || undefined,
          fontStyle: draftFontStyle || undefined,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        preset?: SigningPreset;
      };
      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ?? "Unable to save preset"));
      }
      const nextPreset = data.preset;
      if (nextPreset) {
        setPresets((current) => {
          const withoutCurrent = current.filter((entry) => entry.id !== nextPreset.id);
          return [nextPreset, ...withoutCurrent];
        });
        setSelectedPresetId(nextPreset.id);
        setPresetTouched(true);
      }
      setStatusMessage(`Preset "${presetLabel}" saved.`);
    } catch (error) {
      setStatusMessage(mapApiErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

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

  const renamePreset = async () => {
    if (!selectedPresetId || presetLabel.trim().length < 2) {
      return;
    }
    setSubmitting(true);
    setStatusMessage("");
    try {
      const response = await fetch("/api/sign/presets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          presetId: selectedPresetId,
          label: presetLabel.trim(),
        }),
      });
      const data = (await response.json()) as { error?: string; preset?: SigningPreset };
      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ?? "Unable to rename preset"));
      }
      const updated = data.preset;
      if (updated) {
        setPresets((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      }
      setStatusMessage("Preset renamed.");
    } catch (error) {
      setStatusMessage(mapApiErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  const deletePreset = async () => {
    if (!selectedPresetId) {
      return;
    }
    setSubmitting(true);
    setStatusMessage("");
    try {
      const response = await fetch("/api/sign/presets", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          presetId: selectedPresetId,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ?? "Unable to delete preset"));
      }
      setPresets((current) => current.filter((entry) => entry.id !== selectedPresetId));
      setSelectedPresetId("");
      setStatusMessage("Preset deleted.");
    } catch (error) {
      setStatusMessage(mapApiErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  const setDefaultPreset = async () => {
    if (!selectedPresetId) {
      return;
    }
    setSubmitting(true);
    setStatusMessage("");
    try {
      const response = await fetch("/api/sign/presets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          presetId: selectedPresetId,
        }),
      });
      const data = (await response.json()) as { error?: string; presets?: SigningPreset[] };
      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ?? "Unable to set default preset"));
      }
      if (data.presets) {
        setPresets(data.presets);
      }
      setStatusMessage("Default preset updated.");
    } catch (error) {
      setStatusMessage(mapApiErrorMessage((error as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

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

  const totalAssignedFields = myFieldsOrdered.length;
  const filledFields = totalAssignedFields - fieldsRemaining;
  const progressPct = totalAssignedFields === 0 ? 100 : Math.round((filledFields / totalAssignedFields) * 100);

  return (
    <div className="space-y-4">
      {workflowClosed && (
        <div className="rounded-2xl border border-border bg-surface p-3 text-sm text-text shadow-sm dark:border-white/10 dark:bg-surface/70 dark:backdrop-blur-md">
          <p className="font-semibold text-text">Workflow closed</p>
          <p className="mt-1 text-body">
            This signing workflow is closed for this token (completed/declined/voided). Further actions are disabled.
          </p>
        </div>
      )}

      <div className="sticky top-[var(--app-header-height)] z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 px-3 py-3 text-sm shadow-sm backdrop-blur sm:px-4 dark:border-white/10 dark:bg-surface/80">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{envelope.title}</p>
            <p className="truncate text-[11px] text-muted">
              Signing as {activeSigner?.name ?? "Unknown"} · {activeSigner?.email ?? ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${fieldsRemaining === 0 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-800 dark:text-amber-200"}`}>
            {fieldsRemaining === 0
              ? "All fields ready"
              : `${fieldsRemaining} of ${totalAssignedFields} left`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={documentProxyUrl}
            target="_blank"
            rel="noreferrer"
            className={`${secondaryButtonClass} text-xs`}
            title="Download original PDF"
          >
            Download
          </a>
          <button
            type="button"
            onClick={() => setDeclineModalOpen(true)}
            disabled={workflowClosed}
            className="rounded-lg border border-rose-300/60 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-500/20 disabled:opacity-60 dark:text-rose-300"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={submitSign}
            disabled={submitting || workflowClosed || activeSigner?.role === "APPROVER" || !consentAccepted}
            title={!consentAccepted ? "Agree to the disclosure first" : fieldsRemaining > 0 ? "Some fields are unfilled" : "Submit signing"}
            className={`${primaryButtonClass} text-xs`}
          >
            {fieldsRemaining > 0 ? `Next field (${fieldsRemaining} left)` : "Finish signing"}
          </button>
        </div>
      </div>

      {!consentAccepted && !workflowClosed ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-text shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
              className="h-4 w-4 align-middle"
            />
            <span>
              I confirm that I have read and understood the{" "}
              <button type="button" onClick={() => setDisclosureOpen(true)} className="underline underline-offset-2 hover:text-primary">
                Electronic Record and Signature Disclosure
              </button>{" "}
              and consent to use electronic records and signatures.
            </span>
          </label>
          <button
            type="button"
            onClick={() => {
              setConsentAccepted(true);
              goToNextRemainingField();
            }}
            className={`${primaryButtonClass} sm:min-w-44 justify-center`}
          >
            Agree & Continue
          </button>
        </div>
      ) : null}

      {showMissingFieldsBanner && fieldsRemaining > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/70 bg-rose-500/15 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
          <span className="font-semibold">Some fields are left unfilled.</span>
          <button type="button" onClick={() => setShowMissingFieldsBanner(false)} aria-label="Dismiss" className="rounded p-1 text-danger hover:bg-danger/10">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {fieldsOnWrongPage.length > 0 ? (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <p className="font-medium">Page mismatch</p>
          <p className="mt-1">
            Your signature is on page {fieldsOnWrongPage.map((f) => f.page).join(", ")}, but this preview only has{" "}
            {documentPageCount} page{documentPageCount === 1 ? "" : "s"}.
            {envelope.documentPageCount && envelope.documentPageCount > documentPageCount
              ? ` The stored document reports ${envelope.documentPageCount} pages — try refreshing or use Open Raw PDF.`
              : " Use the Download button to view the full document, or ask the sender to upload the file as a PDF for an accurate layout."}
          </p>
        </div>
      ) : envelope.documentConversionMethod === "text-fallback" ? (
        <div className="rounded-xl border border-border bg-bg px-3 py-2 text-xs text-body">
          This document was converted from Word with a text-only fallback. Page breaks may differ from Microsoft Word.
          For a faithful layout, ask the sender to upload the file as a PDF.
        </div>
      ) : null}

      <div className={builderSplitGridClass}>
        <div ref={previewSectionRef} className={clsx(panelClass, "min-w-0")}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-text">Document preview</p>
            <p className="text-[10px] text-muted">
              Page {previewPage} of {documentPageCount}
              {documentPageCount > 1 ? " · Use arrow keys or Page Up/Down to change page" : ""}
            </p>
          </div>
          {myFieldPages.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-text">Your fields on:</span>
              {myFieldPages.map((pageNumber) => (
                <button
                  key={`jump-page-${pageNumber}`}
                  type="button"
                  onClick={() => goToPreviewPage(pageNumber)}
                  className={`rounded-full border px-2.5 py-1 font-medium transition ${
                    previewPage === pageNumber
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface text-text hover:bg-surface/95"
                  }`}
                >
                  Page {pageNumber}
                </button>
              ))}
            </div>
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

        <aside className="space-y-3 lg:sticky lg:top-32 lg:self-start">
          <div className={panelClass}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-label uppercase">Progress</p>
              <span className="text-xs font-medium text-text">
                {filledFields}/{totalAssignedFields}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {myFieldsOrdered.length > 0 ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => goToField(activeFieldIndex - 1)}
                  className={`${secondaryButtonClass} flex-1 justify-center text-xs`}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => goToField(activeFieldIndex + 1)}
                  className={`${secondaryButtonClass} flex-1 justify-center text-xs`}
                >
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>

          <div className={panelClass}>
            {activeSigner?.role === "APPROVER" ? (
              <>
                <h3 className="text-sm font-semibold text-text">Approval action</h3>
                <p className="mt-1 text-xs text-body">You are assigned as an approver for this envelope.</p>
                <label className="mt-2 block text-sm text-body">
                  Approval note (optional)
                  <textarea
                    value={approvalNote}
                    onChange={(event) => setApprovalNote(event.target.value)}
                    placeholder="Optional decision note"
                    rows={4}
                    className={controlClass}
                  />
                </label>
                <button
                  disabled={submitting || workflowClosed}
                  onClick={submitApprove}
                  className="mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  Approve envelope
                </button>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-text">Current field</h3>
                {activeField ? (
                  <div className="mt-2 rounded-xl border border-border bg-bg p-3 text-xs">
                    <p className="font-medium text-text">
                      {activeField.label?.trim() ||
                        (activeField.type === "SEAL"
                          ? "Stamp"
                          : activeField.type === "SIGNATURE"
                            ? "Signature"
                            : activeField.type === "INITIAL"
                              ? "Initial"
                              : activeField.type.replaceAll("_", " "))}
                    </p>
                    <p className="mt-0.5 text-muted">
                      Page {activeField.page} ·{" "}
                      {completedFieldIds.has(activeField.id)
                        ? "Filled"
                        : activeField.required !== false
                          ? "Required"
                          : "Optional"}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        openFieldForSigning(toDesignerField(activeField, activeSignerEmail, fieldPreviewOverrides))
                      }
                      className={`${primaryButtonClass} mt-2 w-full justify-center text-xs`}
                      disabled={submitting || workflowClosed}
                    >
                      {activeField.type === "SEAL"
                        ? "Add stamp"
                        : activeField.type === "CHECKBOX"
                          ? completedFieldIds.has(activeField.id)
                            ? "Toggle checkbox"
                            : "Check this box"
                          : activeField.type === "SIGNATURE" || activeField.type === "INITIAL"
                            ? completedFieldIds.has(activeField.id)
                              ? "Update signature"
                              : "Add signature"
                            : completedFieldIds.has(activeField.id)
                              ? "Edit value"
                              : "Enter value"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-body">No fields are assigned to you for this envelope.</p>
                )}
                <button
                  type="button"
                  onClick={() => setShowPresetTools((current) => !current)}
                  className={`${secondaryButtonClass} mt-3 w-full justify-center text-xs`}
                >
                  {showPresetTools ? "Hide saved signatures" : "Use saved signature"}
                </button>

                {showPresetTools ? (
                  <div className={`${mutedCardClass} mt-3`}>
                    <p className="text-xs font-medium text-text">Saved presets</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <select
                        value={selectedPresetId}
                        onChange={(event) => {
                          setSelectedPresetId(event.target.value);
                          setPresetTouched(true);
                        }}
                        className="min-w-32 flex-1 rounded-lg border border-border bg-bg px-2 py-2 text-xs text-text"
                      >
                        <option value="">Select preset</option>
                        {presets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.isDefault ? `${preset.label} (Default)` : preset.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" disabled={submitting || !selectedPresetId} onClick={applyPreset} className={`${secondaryButtonClass} text-xs`}>
                        Apply
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        value={presetLabel}
                        onChange={(event) => setPresetLabel(event.target.value)}
                        placeholder="Preset label"
                        className="min-w-32 flex-1 rounded-lg border border-border bg-bg px-2 py-2 text-xs text-text"
                      />
                      <button type="button" disabled={submitting || presetLabel.trim().length < 2} onClick={savePreset} className={`${secondaryButtonClass} text-xs`}>
                        Save
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={submitting || !selectedPresetId || presetLabel.trim().length < 2}
                        onClick={renamePreset}
                        className={`${secondaryButtonClass} text-xs`}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        disabled={submitting || !selectedPresetId}
                        onClick={setDefaultPreset}
                        className={`${secondaryButtonClass} text-xs`}
                      >
                        Set default
                      </button>
                      <button
                        type="button"
                        disabled={submitting || !selectedPresetId}
                        onClick={deletePreset}
                        className="rounded-lg border border-rose-300/60 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 shadow-sm transition hover:bg-rose-500/20 disabled:opacity-60 dark:text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {envelope.fields.length > 0 ? (
            <div className={panelClass}>
              <div className="flex items-center justify-between">
                <p className="text-label uppercase">Fields ({envelope.fields.length})</p>
                <div className="flex gap-1 text-[9px] text-muted">
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-primary">Yours</span>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700">Filled</span>
                </div>
              </div>
              <div className="mt-2 max-h-none space-y-1.5 pr-1 lg:max-h-56 lg:overflow-y-auto lg:overscroll-contain">
                {envelope.fields.map((field, index) => {
                  const locked = isSenderLockedField(field);
                  const editable = canSignerEditField(field, activeSignerEmail);
                  const badge = signingFieldBadge(field, activeSignerEmail);
                  const completed = completedFieldIds.has(field.id);
                  const myIndex = myFieldsOrdered.findIndex((entry) => entry.id === field.id);
                  const isActive = editable && myIndex === activeFieldIndex;
                  return (
                    <button
                      key={`${field.id}-${index}`}
                      type="button"
                      disabled={!editable}
                      onClick={() => {
                        if (myIndex >= 0) {
                          goToField(myIndex);
                        } else {
                          goToPreviewPage(field.page);
                        }
                        openFieldForSigning(toDesignerField(field, activeSignerEmail, fieldPreviewOverrides));
                      }}
                      className={`w-full rounded-lg border px-2 py-1.5 text-left text-[11px] transition ${
                        locked
                          ? "cursor-default border-amber-500/40 bg-amber-500/10 text-text"
                          : editable
                            ? completed
                              ? "border-emerald-500/50 bg-emerald-500/10 text-text"
                              : isActive
                                ? "border-primary bg-primary/10 text-text ring-2 ring-primary/40"
                                : "border-border bg-bg text-text hover:bg-surface"
                            : "cursor-default border-border/60 bg-bg text-muted opacity-80"
                      }`}
                    >
                      <p className="truncate font-medium">
                        {field.label?.trim() ||
                          (field.type === "SIGNATURE"
                            ? "Signature"
                            : field.type === "INITIAL"
                              ? "Initial"
                              : field.type === "SEAL"
                                ? "Stamp"
                                : field.type.replaceAll("_", " "))}
                        {field.required !== false ? " · Required" : ""}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-muted">
                        {badge} · p{field.page}
                        {completed ? " · Filled" : locked ? " · Locked" : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>
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
            <div className="flex items-center gap-6 border-b border-border px-5 pt-4">
              {[
                { id: "TYPE" as const, label: "TYPE", icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
                ) },
                { id: "DRAW" as const, label: "DRAW", icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>
                ) },
                { id: "UPLOAD" as const, label: "UPLOAD", icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                ) },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDraftSignatureType(tab.id)}
                  className={`-mb-px flex flex-col items-center gap-1 border-b-2 px-1 pb-2 pt-1 text-[11px] font-semibold tracking-wider transition ${
                    draftSignatureType === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center ${draftSignatureType === tab.id ? "text-primary" : "text-muted"}`}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSignatureModalOpen(false)}
                aria-label="Close signature picker"
                className="ml-auto mb-2 text-muted transition hover:text-text"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
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
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setDraftSignatureValue(String(reader.result ?? ""));
                        reader.readAsDataURL(file);
                        event.currentTarget.value = "";
                      }}
                      className={controlClass}
                    />
                    {draftSignatureValue && isImageLikeValue(draftSignatureValue) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draftSignatureValue} alt="signature preview" className="mt-3 max-h-24 rounded border border-border bg-white object-contain p-2" />
                    ) : null}
                  </label>
                  <label className="rounded-xl border border-border bg-bg p-3 text-sm text-body">
                    <span className="mb-2 block text-xs font-medium text-text">Initial image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setDraftInitialValue(String(reader.result ?? ""));
                        reader.readAsDataURL(file);
                        event.currentTarget.value = "";
                      }}
                      className={controlClass}
                    />
                    {draftInitialValue && isImageLikeValue(draftInitialValue) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draftInitialValue} alt="initial preview" className="mt-3 max-h-24 rounded border border-border bg-white object-contain p-2" />
                    ) : null}
                  </label>
                </div>
              ) : null}

              {requiresSeal ? (
                <details className="mt-4 rounded-xl border border-border bg-bg p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-text">Add stamp (required for this envelope)</summary>
                  <div className="mt-3 space-y-3">
                    <label className="block text-sm text-body">
                      Upload stamp image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => setDraftSealValue(String(reader.result ?? ""));
                          reader.readAsDataURL(file);
                          event.currentTarget.value = "";
                        }}
                        className={controlClass}
                      />
                    </label>
                    {draftSealValue && isImageLikeValue(draftSealValue) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draftSealValue} alt="stamp preview" className="mt-1 max-h-24 rounded border border-border bg-white object-contain p-2" />
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg/40 px-5 py-3">
              <label className="flex items-center gap-2 text-xs text-body">
                <input
                  type="checkbox"
                  checked={fillSignatureEverywhere}
                  onChange={(event) => setFillSignatureEverywhere(event.target.checked)}
                />
                fills the signature in all places
              </label>
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
                  disabled={
                    (requiresSignature &&
                      draftSignatureType !== "TYPE" &&
                      draftSignatureValue.trim().length === 0 &&
                      draftInitialValue.trim().length === 0) ||
                    (requiresSignature &&
                      draftSignatureType === "TYPE" &&
                      draftSignatureText.trim().length === 0 &&
                      draftInitialText.trim().length === 0) ||
                    (requiresSeal && draftSealValue.trim().length === 0)
                  }
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
