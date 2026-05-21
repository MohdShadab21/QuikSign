"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { DesignerField } from "@/components/envelopes/pdf-field-designer";
import { appAuthHeaders, withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import {
  FIELD_MIN_HEIGHT_PERCENT,
  FIELD_MIN_WIDTH_PERCENT,
  normalizeFieldGeometry,
} from "@/lib/envelopes/field-dimensions";
import { uiControlClass, uiPrimaryButtonClass, uiSecondaryButtonSmClass } from "@/lib/ui/classes";
import { useToast } from "@/components/ui/toast-provider";
import { Check, ChevronDown, ChevronUp, PenLine, Send } from "lucide-react";
import type { EnvelopeTemplatePrefill } from "@/lib/templates/template-prefill";
import { templateRoleEmail } from "@/lib/templates/template-prefill";
import { validateDocumentUploadFile } from "@/lib/client/validate-document-upload";
import { builderSidePanelClass, builderSplitGridClass } from "@/lib/ui/layout";

const PdfFieldDesigner = dynamic(
  () => import("@/components/envelopes/pdf-field-designer").then((module) => module.PdfFieldDesigner),
  {
    ssr: false,
    loading: () => <p className="p-3 text-xs opacity-70">Loading PDF field designer...</p>,
  },
);

type DocumentOption = {
  id: string;
  fileName: string;
};

type SignerInput = {
  name: string;
  email: string;
  signingOrder: number;
  role: "SIGNER" | "APPROVER" | "CC";
  templateRoleKey?: string;
};

function isTemplatePlaceholderEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@template.local");
}

function signersFromTemplatePrefill(prefill: EnvelopeTemplatePrefill): SignerInput[] {
  return prefill.roles.map((role) => ({
    name: role.roleName,
    email: "",
    signingOrder: role.signingOrder,
    role: role.role,
    templateRoleKey: role.roleName,
  }));
}

function remapFieldsForSignerEmail(
  fields: FieldInput[],
  templateRoleKey: string | undefined,
  previousEmail: string,
  nextEmail: string,
): FieldInput[] {
  const trimmedNext = nextEmail.trim();
  if (!trimmedNext) return fields;
  const placeholder = templateRoleKey ? templateRoleEmail(templateRoleKey) : "";
  const trimmedPrevious = previousEmail.trim();
  return fields.map((field) => {
    const matchesPlaceholder = placeholder.length > 0 && field.signerEmail === placeholder;
    const matchesPrevious = trimmedPrevious.length > 0 && field.signerEmail === trimmedPrevious;
    if (!matchesPlaceholder && !matchesPrevious) return field;
    return { ...field, signerEmail: trimmedNext };
  });
}

type FieldInput = DesignerField;
type QuickFieldType = FieldInput["type"];

function recipientColor(email: string): string {
  const palette = ["#2563eb", "#059669", "#9333ea", "#ea580c"];
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) {
    hash = (hash << 5) - hash + email.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length]!;
}

function isImageLikeValue(value: string): boolean {
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

function fieldValueType(field: FieldInput): NonNullable<FieldInput["valueType"]> {
  if (field.type === "SIGNATURE" || field.type === "INITIAL") return "SIGNATURE";
  if (field.type === "SEAL") return "STAMP";
  if (field.type === "DATE") return "DATE";
  if (field.type === "CHECKBOX") return "CHECKBOX";
  if (field.valueType) return field.valueType;
  return "TEXT";
}

function isSenderSignatureField(field: FieldInput): boolean {
  return field.assignedRole === "SENDER" && fieldValueType(field) === "SIGNATURE";
}

function isSenderStampField(field: FieldInput): boolean {
  return field.assignedRole === "SENDER" && fieldValueType(field) === "STAMP";
}

function textTypePlaceholder(type: FieldInput["type"]): string {
  if (type === "EMAIL_ADDRESS") return "name@company.com";
  if (type === "NAME") return "Full name";
  if (type === "FIRST_NAME") return "First name";
  if (type === "LAST_NAME") return "Last name";
  if (type === "COMPANY") return "Company name";
  if (type === "TITLE") return "Job title";
  return "Enter value";
}

function textTypeMaxLength(type: FieldInput["type"]): number {
  if (type === "EMAIL_ADDRESS") return 120;
  if (type === "FIRST_NAME" || type === "LAST_NAME") return 60;
  if (type === "NAME") return 120;
  if (type === "COMPANY") return 140;
  if (type === "TITLE") return 100;
  return 2000;
}

function blankSigner(): SignerInput {
  return { name: "", email: "", signingOrder: 1, role: "SIGNER" };
}

const controlClass = uiControlClass;
const secondaryButtonClass = uiSecondaryButtonSmClass;
const primaryButtonClass = uiPrimaryButtonClass;

export function EnvelopeBuilderForm({
  documents,
  templatePrefill = null,
}: {
  documents: DocumentOption[];
  templatePrefill?: EnvelopeTemplatePrefill | null;
}) {
  const [title, setTitle] = useState(() => templatePrefill?.templateName ?? documents[0]?.fileName ?? "");
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(() => Boolean(templatePrefill));
  const [subject, setSubject] = useState(() => templatePrefill?.description ?? "");
  const [message, setMessage] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(2);
  const [documentOptions, setDocumentOptions] = useState<DocumentOption[]>(documents);
  const [documentSource, setDocumentSource] = useState<"select" | "upload">("select");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentUploadInputKey, setDocumentUploadInputKey] = useState(0);
  const [documentId, setDocumentId] = useState(() => templatePrefill?.documentId ?? documents[0]?.id ?? "");
  const [signers, setSigners] = useState<SignerInput[]>(() =>
    templatePrefill ? signersFromTemplatePrefill(templatePrefill) : [blankSigner()],
  );
  const [fields, setFields] = useState<FieldInput[]>(() => templatePrefill?.fields ?? []);
  const [placementPage, setPlacementPage] = useState(1);
  const [previewPageCount, setPreviewPageCount] = useState(1);
  const [dragSignerIndex, setDragSignerIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState("");
  const [createdEnvelope, setCreatedEnvelope] = useState<{ envelopeId: string; signingLink: string } | null>(null);
  const [selectedSignerEmailForPlacement, setSelectedSignerEmailForPlacement] = useState("");
  const [step, setStep] = useState(1);
  const [selectedFieldType] = useState<QuickFieldType>("SIGNATURE");
  const [fieldHistory, setFieldHistory] = useState<FieldInput[][]>([]);
  const [selectedFieldIndexes, setSelectedFieldIndexes] = useState<number[]>([]);
  const [senderWillSignBeforeSending, setSenderWillSignBeforeSending] = useState(false);
  const [senderSignModalOpen, setSenderSignModalOpen] = useState(false);
  const [senderSignatureMode, setSenderSignatureMode] = useState<"TYPE" | "DRAW">("TYPE");
  const [fieldSignatureMode, setFieldSignatureMode] = useState<"TYPE" | "DRAW">("TYPE");
  const [senderSignatureValue, setSenderSignatureValue] = useState("");
  const [senderSealValue, setSenderSealValue] = useState("");
  const [fieldSaveIndicator, setFieldSaveIndicator] = useState<"idle" | "edited" | "saved">("idle");
  const senderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const senderDrawingRef = useRef(false);
  const fieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldDrawingRef = useRef(false);
  const { pushToast } = useToast();
  const [optionalSettingsOpen, setOptionalSettingsOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<"choose" | "send">(() => (templatePrefill ? "send" : "choose"));

  const steps = [
    "Select Document",
    "Add Recipients",
    "Place Fields",
    "Review & Send",
  ];

  const baseRequestHeaders = useMemo(() => appAuthHeaders(), []);
  const [senderEmailInput, setSenderEmailInput] = useState(() => baseRequestHeaders["x-user-email"] ?? "owner@company.com");
  const previewRequestHeaders = useMemo(
    () => ({
      ...baseRequestHeaders,
      "x-user-email": senderEmailInput.trim() || baseRequestHeaders["x-user-email"] || "owner@company.com",
    }),
    [baseRequestHeaders, senderEmailInput],
  );
  const senderEmail = useMemo(() => previewRequestHeaders["x-user-email"] ?? "sender@company.com", [previewRequestHeaders]);

  const availableSignerEmails = useMemo(
    () => Array.from(new Set(signers.map((signer) => signer.email.trim()).filter((email) => email.length > 0))),
    [signers],
  );

  const placementRecipients = useMemo(
    () =>
      [
        ...(senderWillSignBeforeSending
          ? [
              {
                name: "Sender (You)",
                email: senderEmail,
              },
            ]
          : []),
        ...signers
          .filter((signer) => signer.role !== "CC")
          .map((signer) => ({
            name: signer.name.trim(),
            email: signer.email.trim(),
          }))
          .filter((signer) => signer.email.length > 0),
      ],
    [senderEmail, senderWillSignBeforeSending, signers],
  );

  const selectedSignerEmailForPlacementResolved = useMemo(() => {
    if (selectedSignerEmailForPlacement.trim().length > 0) return selectedSignerEmailForPlacement.trim();
    return placementRecipients[0]?.email ?? "";
  }, [placementRecipients, selectedSignerEmailForPlacement]);

  const duplicateSignerEmailSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const signer of signers) {
      const normalized = signer.email.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }

    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([email]) => email),
    );
  }, [signers]);

  const senderModalNeedsSignature = useMemo(
    () => fields.some((field) => isSenderSignatureField(field) && !(field.prefillValue ?? "").trim()),
    [fields],
  );
  const senderModalNeedsStamp = useMemo(
    () =>
      fields.some(
        (field) => isSenderStampField(field) && (field.required ?? true) && !(field.prefillValue ?? "").trim(),
      ),
    [fields],
  );

  const hasDuplicateSignerEmails = duplicateSignerEmailSet.size > 0;
  const hasValidTitle = title.trim().length > 0;
  const hasSelectedDocument = documentId.trim().length > 0;
  const hasAtLeastOneActiveRecipient = signers.some((signer) => signer.role !== "CC");
  const hasAllSignerRowsValid = signers.every(
    (signer) => signer.name.trim().length >= 2 && signer.email.trim().length > 0 && signer.signingOrder >= 1,
  );
  const hasRealRecipientEmails = signers.every(
    (signer) => signer.role === "CC" || (signer.email.trim().length > 0 && !isTemplatePlaceholderEmail(signer.email)),
  );
  const canProceedFromStep1 = hasValidTitle && hasSelectedDocument;
  const canProceedFromStep2 =
    hasAtLeastOneActiveRecipient && hasAllSignerRowsValid && hasRealRecipientEmails && !hasDuplicateSignerEmails;
  const canProceedFromStep3 = fields.length > 0;
  const canContinue = step === 1 ? canProceedFromStep1 : step === 2 ? canProceedFromStep2 : canProceedFromStep3;
  const completedCount = (canProceedFromStep1 ? 1 : 0) + (canProceedFromStep2 ? 1 : 0) + (canProceedFromStep3 ? 1 : 0);

  const continueGuardMessage =
    step === 1
      ? "Select a document and add a title to continue."
      : step === 2
        ? hasDuplicateSignerEmails
          ? "Fix duplicate recipient emails before continuing."
          : !hasRealRecipientEmails
            ? "Enter a real email for each signer (not the template placeholder)."
            : "Complete valid recipient details (name, email, order)."
        : "Place at least one field on the document to continue.";
  const nextButtonLabel = step === 1 ? "Continue to Recipients" : step === 2 ? "Continue to Place Fields" : "Continue to Review";

  const uploadDocument = async (file: File) => {
    const validationError = validateDocumentUploadFile(file);
    if (validationError) {
      pushToast(validationError, "error");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    setUploadingDocument(true);
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: previewRequestHeaders,
        body: formData,
      });
      const data = (await response.json()) as {
        error?: string;
        document?: { id: string; fileName: string; pageCount?: number | null };
        conversionWarning?: string | null;
        pageCount?: number;
      };
      if (!response.ok || !data.document) {
        throw new Error(mapApiErrorMessage(data.error ?? "Unable to upload document"));
      }
      setDocumentOptions((current) => [data.document!, ...current.filter((doc) => doc.id !== data.document!.id)]);
      setDocumentId(data.document.id);
      setTitle(data.document.fileName);
      setTitleManuallyEdited(false);
      setDocumentSource("select");
      if (typeof data.pageCount === "number" && data.pageCount > 0) {
        setPreviewPageCount(data.pageCount);
      }
      pushToast("Document uploaded and selected.", "success");
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    } finally {
      setUploadingDocument(false);
    }
  };

  const canNavigateToStep = (targetStep: number): boolean => {
    if (targetStep <= step) {
      return true;
    }
    if (step < 2 && targetStep >= 2 && !canProceedFromStep1) {
      return false;
    }
    if (step < 3 && targetStep >= 3 && !canProceedFromStep2) {
      return false;
    }
    if (step < 4 && targetStep >= 4 && !canProceedFromStep3) {
      return false;
    }
    return true;
  };

  const onAddSigner = () => {
    setSigners((current) => [...current, { ...blankSigner(), signingOrder: current.length + 1 }]);
  };

  const reorderSigners = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setSigners((current) => {
      if (fromIndex < 0 || fromIndex >= current.length) return current;
      if (toIndex < 0 || toIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved!);
      return next.map((entry, idx) => ({ ...entry, signingOrder: idx + 1 }));
    });
  };

  const applyFieldMutation = (mutate: (current: FieldInput[]) => FieldInput[]) => {
    setFields((current) => {
      setFieldHistory((history) => [...history.slice(-39), current]);
      return mutate(current);
    });
  };

  const selectedFieldIndex = selectedFieldIndexes.length === 1 ? selectedFieldIndexes[0] : null;
  const selectedField = selectedFieldIndex === null ? null : fields[selectedFieldIndex] ?? null;
  const selectedFieldValueType = selectedField ? fieldValueType(selectedField) : "TEXT";
  const selectedFieldPrefill = selectedField?.prefillValue ?? "";
  const effectiveFieldSignatureMode: "TYPE" | "DRAW" =
    selectedFieldValueType === "SIGNATURE" && selectedFieldPrefill.startsWith("data:image/")
      ? "DRAW"
      : fieldSignatureMode;
  const selectedFieldTextLimit = selectedField ? textTypeMaxLength(selectedField.type) : 2000;
  const selectedFieldIsEmailType = selectedField?.type === "EMAIL_ADDRESS";
  const selectedFieldEmailValid = !selectedFieldIsEmailType || selectedFieldPrefill.trim().length === 0
    ? true
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedFieldPrefill.trim());
  const updateSelectedField = (patch: Partial<FieldInput>) => {
    if (selectedFieldIndex === null) {
      return;
    }
    setFieldSaveIndicator("edited");
    applyFieldMutation((current) =>
      current.map((entry, index) => {
        if (index !== selectedFieldIndex) {
          return entry;
        }
        const merged = { ...entry, ...patch };
        const touchesGeometry =
          patch.x !== undefined ||
          patch.y !== undefined ||
          patch.width !== undefined ||
          patch.height !== undefined;
        return touchesGeometry ? normalizeFieldGeometry(merged) : merged;
      }),
    );
  };

  useEffect(() => {
    if (fieldSaveIndicator !== "edited") {
      return;
    }
    const timer = window.setTimeout(() => {
      setFieldSaveIndicator("saved");
    }, 450);
    return () => window.clearTimeout(timer);
  }, [fieldSaveIndicator]);

  const displayedFieldSaveIndicator: "idle" | "edited" | "saved" = selectedField ? fieldSaveIndicator : "idle";

  const onStampUploadForSelectedField = async (file: File | null) => {
    if (!file) {
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
    updateSelectedField({ prefillValue: dataUrl, valueType: "STAMP" });
    pushToast("Stamp uploaded.", "success");
  };

  const onTextLikePrefillChange = (rawValue: string) => {
    if (!selectedField) {
      return;
    }
    const clipped = rawValue.slice(0, textTypeMaxLength(selectedField.type));
    updateSelectedField({ prefillValue: clipped });
  };

  const onTextLikePrefillBlur = () => {
    if (!selectedField) {
      return;
    }
    const current = (selectedField.prefillValue ?? "").trim();
    if (selectedField.type === "EMAIL_ADDRESS") {
      updateSelectedField({ prefillValue: current.toLowerCase() });
      return;
    }
    if (selectedField.type === "NAME" || selectedField.type === "FIRST_NAME" || selectedField.type === "LAST_NAME") {
      const normalized = current
        .split(/\s+/)
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
      updateSelectedField({ prefillValue: normalized });
      return;
    }
    updateSelectedField({ prefillValue: current });
  };

  const beginFieldInteraction = () => {
    setFieldHistory((history) => [...history.slice(-39), fields]);
  };

  const undoFieldMutation = () => {
    setFieldHistory((history) => {
      const last = history.at(-1);
      if (!last) {
        return history;
      }
      setFields(last);
      return history.slice(0, -1);
    });
  };

  const resolvedEnvelopeTitle = useMemo(() => {
    const typed = title.trim();
    if (typed.length >= 2) return typed;
    const fileName = documentOptions.find((d) => d.id === documentId)?.fileName?.trim() ?? "";
    return fileName.length >= 2 ? fileName : "Untitled Envelope";
  }, [title, documentOptions, documentId]);

  const submitEnvelope = async () => {
    if (hasDuplicateSignerEmails) {
      pushToast("Each signer must use a unique email address.", "error");
      setStep(2);
      return;
    }
    setSubmitting(true);
    setResult("");
    setCreatedEnvelope(null);

    const fallbackFields = signers
      .filter((signer) => signer.email.trim().length > 0 && signer.role !== "CC")
      .map((signer, index) => ({
        signerEmail: signer.email,
        label: "Signature",
        required: true,
        readOnly: false,
        prefillValue: "",
        prefilledBySender: false,
        assignedRole: "RECIPIENT" as const,
        valueType: "SIGNATURE" as const,
        zIndex: index + 1,
        page: 1,
        x: 6,
        y: 70,
        width: 18,
        height: 8,
        type: "SIGNATURE" as const,
      }));
    const baseFields = fields.length > 0 ? fields : fallbackFields;
    const payloadFields = senderWillSignBeforeSending
      ? baseFields.map((field) => {
          if (field.assignedRole !== "SENDER") {
            return field;
          }
          const vt = fieldValueType(field);
          const fromField = (field.prefillValue ?? "").trim();
          const prefillValue =
            vt === "SIGNATURE"
              ? fromField || senderSignatureValue.trim()
              : vt === "STAMP"
                ? fromField || senderSealValue.trim()
                : field.prefillValue ?? "";
          return {
            ...field,
            valueType: vt,
            prefillValue,
            prefilledBySender: true,
            readOnly: true,
          };
        })
      : baseFields;

    const maxFieldPage = payloadFields.reduce((max, field) => Math.max(max, field.page), 1);
    if (maxFieldPage > previewPageCount) {
      pushToast(
        `A field is on page ${maxFieldPage}, but the document preview only has ${previewPageCount} page(s). Adjust field pages or re-upload the document.`,
        "error",
      );
      setSubmitting(false);
      return;
    }

    if (senderWillSignBeforeSending) {
      const missingSenderSignature = payloadFields.some(
        (field) => isSenderSignatureField(field) && !(field.prefillValue ?? "").trim(),
      );
      if (missingSenderSignature) {
        pushToast("Add a sender signature in Field Properties (or the dialog) before creating the envelope.", "error");
        setSubmitting(false);
        return;
      }
      const missingSenderStamp = payloadFields.some(
        (field) =>
          isSenderStampField(field) && (field.required ?? true) && !(field.prefillValue ?? "").trim(),
      );
      if (missingSenderStamp) {
        pushToast("Add a sender stamp for required stamp fields before creating the envelope.", "error");
        setSubmitting(false);
        return;
      }
    }

    const normalizedPayloadFields = payloadFields.map((field) => ({
      ...normalizeFieldGeometry(field),
      signerEmail: field.signerEmail.trim(),
      zIndex: Math.max(1, Math.round(Number(field.zIndex) || 1)),
    }));

    const senderEmailNorm = senderEmail.trim().toLowerCase();
    const recipientSigners = signers.map((signer, index) => ({
      ...signer,
      name: signer.name.trim(),
      email: signer.email.trim(),
      signingOrder: signer.signingOrder >= 1 ? signer.signingOrder : index + 1,
    }));

    let envelopeSigners = recipientSigners;
    if (senderWillSignBeforeSending) {
      const senderAlreadyListed = recipientSigners.some(
        (signer) => signer.email.trim().toLowerCase() === senderEmailNorm,
      );
      if (senderAlreadyListed) {
        envelopeSigners = recipientSigners.map((signer, index) => ({
          ...signer,
          signingOrder: index + 1,
        }));
      } else {
        envelopeSigners = [
          {
            name: "Sender",
            email: senderEmail.trim(),
            signingOrder: 1,
            role: "SIGNER" as const,
          },
          ...recipientSigners.map((signer, index) => ({
            ...signer,
            signingOrder: index + 2,
          })),
        ];
      }
    }

    try {
      const response = await fetch("/api/envelopes", {
        method: "POST",
        headers: {
          ...withJsonHeaders(),
          "x-user-email": senderEmailInput.trim() || baseRequestHeaders["x-user-email"] || "owner@company.com",
        },
        body: JSON.stringify({
          title: resolvedEnvelopeTitle,
          subject: subject || undefined,
          message: message || undefined,
          expiresInDays,
          documentId,
          signers: envelopeSigners,
          fields: normalizedPayloadFields,
        }),
      });

      let data: { error?: unknown; envelopeId?: string; signingLink?: string } = {};
      try {
        data = (await response.json()) as typeof data;
      } catch {
        // Response wasn't JSON; surface a clear error below.
      }
      if (!response.ok) {
        const reason =
          data?.error !== undefined && data.error !== null && data.error !== ""
            ? mapApiErrorMessage(data.error)
            : `Envelope creation failed (HTTP ${response.status}).`;
        throw new Error(reason);
      }

      if (data.envelopeId && data.signingLink) {
        setCreatedEnvelope({ envelopeId: data.envelopeId, signingLink: data.signingLink });
        window.localStorage.removeItem(flowDraftStorageKey);
      }
      setResult("");
      pushToast("Envelope sent successfully.", "success");
      setStep(4);
    } catch (error) {
      const friendly = mapApiErrorMessage((error as Error).message || "Envelope creation failed");
      // Log the raw payload only when an error happens, to assist debugging without leaking noise.
      console.error("Envelope create failed", { friendly, error });
      setResult(friendly);
      pushToast(friendly, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const requestCreateEnvelope = async () => {
    if (!senderWillSignBeforeSending) {
      await submitEnvelope();
      return;
    }

    if (senderModalNeedsSignature || senderModalNeedsStamp) {
      setSenderSignModalOpen(true);
      return;
    }

    await submitEnvelope();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  const copySigningLink = async () => {
    if (!createdEnvelope?.signingLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createdEnvelope.signingLink);
      pushToast("Signing link copied.", "success");
    } catch {
      pushToast("Unable to copy link on this browser.", "error");
    }
  };

  const previewUrl = useMemo(
    () => (documentId ? `/api/documents/${encodeURIComponent(documentId)}/file` : null),
    [documentId],
  );

  const flowDraftStorageKey = "quiksign:send-document:flow-draft:v1";

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(flowDraftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        title?: string;
        subject?: string;
        message?: string;
        expiresInDays?: number;
        documentId?: string;
        optionalSettingsOpen?: boolean;
        signers?: SignerInput[];
      };
      queueMicrotask(() => {
        if (typeof parsed.title === "string") setTitle(parsed.title);
        if (typeof parsed.subject === "string") setSubject(parsed.subject);
        if (typeof parsed.message === "string") setMessage(parsed.message);
        if (typeof parsed.expiresInDays === "number" && Number.isFinite(parsed.expiresInDays)) {
          setExpiresInDays(Math.max(1, Math.min(60, parsed.expiresInDays)));
        }
        if (typeof parsed.documentId === "string" && parsed.documentId.trim()) setDocumentId(parsed.documentId);
        if (typeof parsed.optionalSettingsOpen === "boolean") setOptionalSettingsOpen(parsed.optionalSettingsOpen);
        if (Array.isArray(parsed.signers) && parsed.signers.length > 0) setSigners(parsed.signers);
      });
    } catch {
      // ignore malformed local drafts
    }
  }, []);

  useEffect(() => {
    const payload = {
      title,
      subject,
      message,
      expiresInDays,
      documentId,
      optionalSettingsOpen,
      signers,
    };
    window.localStorage.setItem(flowDraftStorageKey, JSON.stringify(payload));
  }, [documentId, expiresInDays, message, optionalSettingsOpen, signers, subject, title]);

  useEffect(() => {
    if (!senderSignModalOpen || senderSignatureMode !== "DRAW") {
      return;
    }
    const canvas = senderCanvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#111827";
  }, [senderSignModalOpen, senderSignatureMode]);

  useEffect(() => {
    if (!selectedField || selectedFieldValueType !== "SIGNATURE" || effectiveFieldSignatureMode !== "DRAW") {
      return;
    }
    const canvas = fieldCanvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (selectedField.prefillValue?.startsWith("data:image/")) {
      const image = new Image();
      image.onload = () => {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = selectedField.prefillValue;
    }
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#111827";
  }, [effectiveFieldSignatureMode, selectedField, selectedFieldValueType]);

  const beginSenderDrawing = (clientX: number, clientY: number) => {
    const canvas = senderCanvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    senderDrawingRef.current = true;
    context.beginPath();
    context.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const continueSenderDrawing = (clientX: number, clientY: number) => {
    if (!senderDrawingRef.current) {
      return;
    }
    const canvas = senderCanvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.lineTo(clientX - rect.left, clientY - rect.top);
    context.stroke();
  };

  const endSenderDrawing = () => {
    if (!senderDrawingRef.current) {
      return;
    }
    senderDrawingRef.current = false;
    const dataUrl = senderCanvasRef.current?.toDataURL("image/png") ?? "";
    setSenderSignatureValue(dataUrl);
  };

  const beginFieldDrawing = (clientX: number, clientY: number) => {
    const canvas = fieldCanvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    fieldDrawingRef.current = true;
    context.beginPath();
    context.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const continueFieldDrawing = (clientX: number, clientY: number) => {
    if (!fieldDrawingRef.current) {
      return;
    }
    const canvas = fieldCanvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.lineTo(clientX - rect.left, clientY - rect.top);
    context.stroke();
  };

  const endFieldDrawing = () => {
    if (!fieldDrawingRef.current) {
      return;
    }
    fieldDrawingRef.current = false;
    const dataUrl = fieldCanvasRef.current?.toDataURL("image/png") ?? "";
    updateSelectedField({ prefillValue: dataUrl, valueType: "SIGNATURE" });
  };

  if (entryMode === "choose") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-label uppercase">Sign</p>
        <p className="mt-1 text-sm text-body">Choose how you want to continue.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setEntryMode("send")}
            className="group rounded-xl border border-border bg-bg p-6 text-left transition hover:border-primary hover:shadow-sm"
          >
            <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3 text-primary" aria-hidden>
              <Send className="h-6 w-6" />
            </div>
            <p className="text-lg font-semibold text-text">Send for signatures</p>
            <p className="mt-1 text-sm text-body">Start the guided send flow for recipients.</p>
          </button>
          <Link
            href="/sign-documents"
            className="group rounded-xl border border-border bg-bg p-6 transition hover:border-primary hover:shadow-sm"
          >
            <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3 text-primary" aria-hidden>
              <PenLine className="h-6 w-6" />
            </div>
            <p className="text-lg font-semibold text-text">Sign yourself</p>
            <p className="mt-1 text-sm text-body">Upload a document and complete your own signing.</p>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="w-full min-w-0 space-y-6 sm:space-y-8">
      {templatePrefill && !createdEnvelope ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-body">
          Sending from template <span className="font-semibold text-text">{templatePrefill.templateName}</span>. Field
          placements are loaded — add each recipient&apos;s real name and email in step 2.
        </div>
      ) : null}
      {createdEnvelope ? (
        <div className="space-y-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-label uppercase">Success</p>
            <h2 className="text-heading text-xl">Envelope created successfully</h2>
            <p className="text-sm text-body">
              Envelope ID: <span className="font-semibold text-text">{createdEnvelope.envelopeId}</span>
            </p>
            <p className="text-xs text-muted">Choose a next action to deliver this envelope right away.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={copySigningLink} className={primaryButtonClass}>
              Copy Signing Link
            </button>
            <a
              href={`mailto:?subject=${encodeURIComponent(`Please sign envelope ${createdEnvelope.envelopeId}`)}&body=${encodeURIComponent(
                `Please review and sign the document:\n${createdEnvelope.signingLink}`,
              )}`}
              className={secondaryButtonClass}
            >
              Send via Email
            </a>
            <a
              href={createdEnvelope.signingLink}
              target="_blank"
              rel="noreferrer"
              className={secondaryButtonClass}
            >
              Open Signing Page
            </a>
          </div>
          <div>
            <button
              type="button"
              onClick={() => {
                setCreatedEnvelope(null);
                setResult("");
                setStep(1);
              }}
              className={secondaryButtonClass}
            >
              Create Another Envelope
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-label uppercase">Send document</p>
              <p className="text-sm text-body">
                Step <span className="font-semibold text-text">{step}</span> of 4 ·{" "}
                <span className="font-semibold text-text">{completedCount}</span>/4 completed
              </p>
              <p className="text-xs text-muted">Complete each step in order to create a send-ready envelope.</p>
            </div>
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
              {steps.map((label, idx) => {
                const stepNum = idx + 1;
                const done =
                  (stepNum === 1 && canProceedFromStep1) ||
                  (stepNum === 2 && canProceedFromStep2) ||
                  (stepNum === 3 && canProceedFromStep3);
                const active = stepNum === step;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (canNavigateToStep(stepNum)) {
                        setStep(stepNum);
                        return;
                      }
                      pushToast(continueGuardMessage, "error");
                    }}
                    className={`group inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
                      active ? "border-primary bg-primary text-white" : "border-border bg-bg text-text hover:bg-surface"
                    }`}
                    aria-label={`Go to step ${stepNum}: ${label}`}
                  >
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                        active ? "bg-white/20 text-white" : done ? "bg-emerald-500/15 text-emerald-600" : "bg-surface text-text"
                      }`}
                      aria-hidden
                    >
                      {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : stepNum}
                    </span>
                    <span className="hidden text-xs font-medium sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border/60">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${((step - 1) / 3) * 100}%` }}
              aria-hidden
            />
          </div>
        </div>
      )}

      {!createdEnvelope && step === 1 ? (
        <div className="space-y-6">
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <p className="text-sm font-semibold text-text">Document Source</p>
            <p className="text-xs text-muted">Choose an existing document or upload your original PDF (unchanged — we only place signature fields on top).</p>
            <div className="inline-flex rounded-lg border border-border bg-bg p-1 text-xs">
              <button
                type="button"
                onClick={() => setDocumentSource("select")}
                className={`rounded px-3 py-1.5 ${documentSource === "select" ? "bg-primary text-white" : "text-text"}`}
              >
                Select Document
              </button>
              <button
                type="button"
                onClick={() => setDocumentSource("upload")}
                className={`rounded px-3 py-1.5 ${documentSource === "upload" ? "bg-primary text-white" : "text-text"}`}
              >
                Upload Document
              </button>
            </div>
            {documentSource === "select" ? (
              <label className="block text-xs text-body">
                Document
                <select
                  required
                  value={documentId}
                  onChange={(event) => {
                    const nextDocumentId = event.target.value;
                    setDocumentId(nextDocumentId);
                    if (!titleManuallyEdited || title.trim().length === 0) {
                      const selectedName = documentOptions.find((doc) => doc.id === nextDocumentId)?.fileName ?? "";
                      if (selectedName.trim().length > 0) {
                        setTitle(selectedName);
                      }
                    }
                  }}
                  className={`${controlClass} mt-1`}
                >
                  {documentOptions.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.fileName}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block text-xs text-body">
                Upload PDF
                <input
                  key={documentUploadInputKey}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    if (!picked) return;
                    void uploadDocument(picked);
                    setDocumentUploadInputKey((k) => k + 1);
                  }}
                  disabled={uploadingDocument}
                  className={`${controlClass} mt-1`}
                />
                <span className="mt-1 block text-[11px] text-muted">
                  {uploadingDocument
                    ? "Converting Word to PDF (may take up to a minute)..."
                    : "PDF or Word (.docx). PDFs unchanged; Word is converted to a layout-preserving PDF (LibreOffice locally, Gotenberg/Graph in production)."}
                </span>
              </label>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs text-body">
                Title <span className="text-rose-600">*</span>
                <input
                  required
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setTitleManuallyEdited(true);
                  }}
                  className={`${controlClass} mt-1`}
                />
              </label>
              <label className="block text-xs text-body">
                Expires in days
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={expiresInDays}
                  onChange={(event) => setExpiresInDays(Number(event.target.value))}
                  className={`${controlClass} mt-1`}
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <button
              type="button"
              onClick={() => setOptionalSettingsOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-bg px-3 py-2 text-left text-sm font-medium text-text transition hover:bg-surface"
              aria-expanded={optionalSettingsOpen}
            >
              Optional Settings
              <span className="text-xs text-muted" aria-hidden>
                {optionalSettingsOpen ? "Collapse" : "Expand"}
              </span>
            </button>
            {optionalSettingsOpen ? (
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <label className="block text-xs text-body md:col-span-2">
                  Email subject (optional)
                  <input value={subject} onChange={(event) => setSubject(event.target.value)} className={`${controlClass} mt-1`} />
                </label>
                <label className="block text-xs text-body md:col-span-2">
                  Email message (optional)
                  <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className={`${controlClass} mt-1`} />
                </label>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted">You can customize email subject and message here.</p>
            )}
          </div>
        </div>
      ) : null}

      {step === 2 && !createdEnvelope ? (
        <div className="space-y-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-label uppercase">Recipients</p>
            <p className="text-sm text-body">Add recipients in order. Drag cards to reorder.</p>
          </div>
          <button type="button" onClick={onAddSigner} className={secondaryButtonClass}>
            + Add Recipient
          </button>
        </div>
        {hasDuplicateSignerEmails ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            Duplicate signer emails are not allowed. Update the highlighted recipient rows.
          </p>
        ) : null}
        <div className="grid gap-6">
          {signers.map((signer, index) => {
            const duplicate = duplicateSignerEmailSet.has(signer.email.trim().toLowerCase());
            const roleLabel =
              signer.role === "SIGNER" ? "Signer" : signer.role === "APPROVER" ? "Approver" : "CC (Viewer)";
            return (
              <div
                key={`signer-${index}`}
                className="rounded-2xl border border-border bg-bg p-4 shadow-sm transition hover:shadow-md"
                draggable
                onDragStart={() => setDragSignerIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragSignerIndex === null) return;
                  reorderSigners(dragSignerIndex, index);
                  setDragSignerIndex(null);
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">
                      {index + 1}. {roleLabel}
                    </p>
                    {signer.templateRoleKey ? (
                      <p className="text-xs text-primary">Template role: {signer.templateRoleKey}</p>
                    ) : (
                      <p className="text-xs text-muted">Drag to reorder · Order updates automatically</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        signer.role === "SIGNER"
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-surface text-muted"
                      }`}
                    >
                      {roleLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (signers.length <= 1) {
                          pushToast("At least one recipient is required.", "error");
                          return;
                        }
                        const removedEmail = signer.email.trim();
                        const nextSigners = signers
                          .filter((_, currentIndex) => currentIndex !== index)
                          .map((entry, orderIndex) => ({ ...entry, signingOrder: orderIndex + 1 }));
                        setSigners(nextSigners);
                        if (removedEmail && removedEmail === selectedSignerEmailForPlacementResolved) {
                          setSelectedSignerEmailForPlacement(nextSigners.find((s) => s.role !== "CC" && s.email.trim())?.email.trim() ?? "");
                        }
                      }}
                      className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-500/15"
                      aria-label={`Remove recipient ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-xs text-body">
                    Name
                    <input
                      required
                      value={signer.name}
                      onChange={(event) =>
                        setSigners((current) =>
                          current.map((entry, currentIndex) =>
                            currentIndex === index ? { ...entry, name: event.target.value } : entry,
                          ),
                        )
                      }
                      className={`${controlClass} mt-1`}
                    />
                  </label>
                  <label className="block text-xs text-body">
                    Email
                    <input
                      required
                      type="email"
                      value={signer.email}
                      placeholder={signer.templateRoleKey ? "name@company.com" : undefined}
                      onChange={(event) => {
                        const nextEmail = event.target.value;
                        const previousEmail = signer.email;
                        setSigners((current) =>
                          current.map((entry, currentIndex) =>
                            currentIndex === index ? { ...entry, email: nextEmail } : entry,
                          ),
                        );
                        setFields((current) =>
                          remapFieldsForSignerEmail(current, signer.templateRoleKey, previousEmail, nextEmail),
                        );
                      }}
                      className={`${controlClass} mt-1 ${duplicate ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
                    />
                  </label>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-xs text-body">
                    Role
                    <select
                      value={signer.role}
                      onChange={(event) =>
                        setSigners((current) =>
                          current.map((entry, currentIndex) =>
                            currentIndex === index
                              ? { ...entry, role: event.target.value as "SIGNER" | "CC" }
                              : entry,
                          ),
                        )
                      }
                      className={`${controlClass} mt-1`}
                    >
                      <option value="SIGNER">Signer</option>
                      <option value="CC">CC (Viewer)</option>
                    </select>
                  </label>
                  <label className="block text-xs text-body">
                    Order
                    <input
                      required
                      type="number"
                      min={1}
                      value={index + 1}
                      readOnly
                      className={`${controlClass} mt-1 opacity-75`}
                    />
                  </label>
                </div>

                {duplicate ? (
                  <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">
                    Duplicate email. Each recipient email must be unique.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        </div>
      ) : null}

      {step === 3 && !createdEnvelope ? (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-label uppercase">Place fields</p>
              <p className="text-sm text-body">Assign fields to recipients and place them on the PDF.</p>
          </div>
          <p className="text-xs text-muted">Drag fields from the tools into the document to place them.</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-text">Tools</p>
          <div className="mt-3">
            <p className="text-xs font-medium text-text">Placing fields for</p>
            {placementRecipients.length === 0 ? (
              <p className="mt-1 text-xs text-muted">Add signer recipients (with email) to place fields.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {placementRecipients.map((recipient) => {
                  const active = recipient.email === selectedSignerEmailForPlacementResolved;
                  return (
                    <button
                      key={recipient.email}
                      type="button"
                      onClick={() => setSelectedSignerEmailForPlacement(recipient.email)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-bg text-text hover:bg-surface"
                      }`}
                    >
                      <p className="max-w-[220px] truncate font-semibold">{recipient.name || "Signer"}</p>
                      <p className="max-w-[220px] truncate text-muted">{recipient.email}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <label className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-bg p-3 text-sm text-body">
            <input
              type="checkbox"
              checked={senderWillSignBeforeSending}
              onChange={(event) => {
                const next = event.target.checked;
                setSenderWillSignBeforeSending(next);
                if (!next && selectedSignerEmailForPlacementResolved === senderEmail) {
                  setSelectedSignerEmailForPlacement(signers.find((s) => s.role !== "CC" && s.email.trim())?.email.trim() ?? "");
                }
              }}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold text-text">I will sign before sending.</span>{" "}
              Prefill and lock sender-assigned signature/stamp fields in Field Properties (or use the dialog if a value is still missing when you create the envelope).
            </span>
          </label>
          {senderWillSignBeforeSending ? (
            <label className="mt-3 block text-xs text-body">
              Sender email
              <input
                value={senderEmailInput}
                onChange={(event) => setSenderEmailInput(event.target.value)}
                placeholder="you@company.com"
                className={`${controlClass} mt-1`}
              />
              <span className="mt-1 block text-[11px] text-muted">This will be used for the “Sender (You)” chip.</span>
            </label>
          ) : null}
          <div className="mt-3 rounded-xl border border-border bg-bg p-3">
            <p className="text-xs font-medium text-text">Field items</p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {fields.length === 0 ? (
                <p className="text-[11px] text-muted">No fields yet.</p>
              ) : (
                fields.map((field, index) => (
                  <button
                    key={`jump-${index}`}
                    type="button"
                    aria-label={`Jump to field ${field.label?.trim() || field.type} on page ${field.page}`}
                    onClick={() => {
                      setPlacementPage(field.page);
                      pushToast(`Jumped to page ${field.page}.`, "success");
                    }}
                    className="rounded-lg border border-border bg-surface px-2 py-1.5 text-left text-[11px] text-text transition hover:bg-surface/95"
                  >
                    <div className="flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: recipientColor(field.signerEmail) }}
                      />
                      <p className="truncate text-[11px] text-muted">{field.signerEmail}</p>
                    </div>
                    <p className="mt-1 truncate font-medium">{field.label?.trim() || field.type} · p{field.page}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-text">Field Items and others</p>
          <div className={builderSplitGridClass}>
            <div className="min-w-0 rounded-xl border border-border bg-bg p-2 sm:p-3">
              <p className="mb-2 text-xs font-medium text-text">Document</p>
              {selectedFieldIndex !== null ? (
                <p className="mb-2 text-xs text-body">Selected field is ready for property edits on the right panel.</p>
              ) : null}
                <PdfFieldDesigner
                documentUrl={previewUrl}
                documentRequestHeaders={previewRequestHeaders}
                prefillEditingMode="senderOnly"
                selectedSignerEmail={selectedSignerEmailForPlacementResolved}
                placementPage={placementPage}
                fields={fields}
                selectedFieldType={selectedFieldType}
                paletteVariant="icon"
                showZoomControls
                onAddField={(field) =>
                  applyFieldMutation((current) => [
                    ...current,
                    selectedSignerEmailForPlacementResolved === senderEmail
                      ? { ...field, assignedRole: "SENDER", prefilledBySender: true }
                      : { ...field, assignedRole: "RECIPIENT", prefilledBySender: false },
                  ])
                }
                onUpdateField={(index, updatedField) =>
                  setFields((current) =>
                    current.map((entry, currentIndex) =>
                      currentIndex === index ? normalizeFieldGeometry(updatedField) : entry,
                    ),
                  )
                }
                onDeleteField={(index) =>
                  applyFieldMutation((current) => current.filter((_, currentIndex) => currentIndex !== index))
                }
                onClearPage={(page) => applyFieldMutation((current) => current.filter((entry) => entry.page !== page))}
                onUndo={undoFieldMutation}
                canUndo={fieldHistory.length > 0}
                onSelectedFieldIndexesChange={setSelectedFieldIndexes}
                onInteractionStart={beginFieldInteraction}
                onPageBounds={(numPages) => {
                  setPreviewPageCount(numPages);
                  if (placementPage > numPages) {
                    setPlacementPage(numPages);
                  }
                }}
                onPlacementPageChange={setPlacementPage}
                />
            </div>
            <div className={clsx("rounded-xl border border-border bg-bg p-2 text-xs sm:p-3", builderSidePanelClass)}>
              <p className="text-xs font-medium text-text">Field Property</p>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Field Properties</p>
              {selectedField ? (
                <span
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    displayedFieldSaveIndicator === "edited"
                      ? "bg-warning/10 text-warning"
                      : displayedFieldSaveIndicator === "saved"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-bg text-body"
                  }`}
                >
                  {displayedFieldSaveIndicator === "edited" ? "Edited" : displayedFieldSaveIndicator === "saved" ? "Saved" : "Ready"}
                </span>
              ) : null}
            </div>
            {!selectedField ? (
              <p className="opacity-75">Select one field on canvas to edit properties.</p>
            ) : (
              <>
                <label className="block">
                  Label
                  <input
                    value={selectedField.label ?? ""}
                    onChange={(event) => updateSelectedField({ label: event.target.value })}
                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-text"
                  />
                </label>
                <label className="block">
                  Value Type
                  <select
                    value={selectedField.valueType ?? "TEXT"}
                    onChange={(event) => {
                      const nextType = event.target.value as FieldInput["valueType"];
                      updateSelectedField({
                        valueType: nextType,
                        prefillValue: nextType === "CHECKBOX" ? "false" : selectedField.prefillValue ?? "",
                      });
                    }}
                    className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-text"
                  >
                    <option value="TEXT">Text</option>
                    <option value="DATE">Date</option>
                    <option value="CHECKBOX">Checkbox</option>
                    <option value="SIGNATURE">Signature</option>
                    <option value="STAMP">Stamp</option>
                  </select>
                </label>
                {selectedField.assignedRole !== "SENDER" ? (
                  <div className="rounded-lg border border-border bg-surface p-2 text-[11px] text-muted">
                    Recipient will fill this value during signing. You only need to place the field and set its label/type.
                  </div>
                ) : (
                <label className="block">
                  Prefill Value (Sender)
                  {selectedFieldValueType === "DATE" ? (
                    <input
                      type="date"
                      value={selectedField.prefillValue ?? ""}
                      onChange={(event) => updateSelectedField({ prefillValue: event.target.value })}
                      className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-text"
                    />
                  ) : null}
                  {selectedFieldValueType === "CHECKBOX" ? (
                    <label className="mt-1 inline-flex items-center gap-2 rounded border border-border bg-bg px-2 py-1">
                      <input
                        type="checkbox"
                        checked={(selectedField.prefillValue ?? "false") === "true"}
                        onChange={(event) => updateSelectedField({ prefillValue: event.target.checked ? "true" : "false" })}
                      />
                      Checked by default
                    </label>
                  ) : null}
                  {selectedFieldValueType === "SIGNATURE" ? (
                    <div className="mt-1 space-y-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFieldSignatureMode("TYPE")}
                          className={`rounded px-2 py-1 text-[11px] ${effectiveFieldSignatureMode === "TYPE" ? "bg-primary text-white" : "border border-border text-body"}`}
                        >
                          Type
                        </button>
                        <button
                          type="button"
                          onClick={() => setFieldSignatureMode("DRAW")}
                          className={`rounded px-2 py-1 text-[11px] ${effectiveFieldSignatureMode === "DRAW" ? "bg-primary text-white" : "border border-border text-body"}`}
                        >
                          Draw
                        </button>
                      </div>
                      {effectiveFieldSignatureMode === "TYPE" ? (
                        <>
                          <input
                            value={selectedField.prefillValue?.startsWith("data:image/") ? "" : selectedField.prefillValue ?? ""}
                            onChange={(event) =>
                              updateSelectedField({ prefillValue: event.target.value, valueType: "SIGNATURE" })
                            }
                            placeholder="Type signature text"
                            className="w-full rounded border border-border bg-bg px-2 py-1 text-text"
                            style={{ fontFamily: '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive', fontSize: "16px" }}
                          />
                          {selectedField.prefillValue?.startsWith("data:image/") ? (
                            <p className="text-[11px] opacity-75">
                              This field currently uses a drawn signature. Switch to Draw mode to view/edit it.
                            </p>
                          ) : null}
                          <div
                            className="rounded border border-border bg-surface px-2 py-2"
                            style={{ fontFamily: '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive', fontSize: "18px" }}
                          >
                            {(selectedField.prefillValue ?? "").trim().length > 0 ? selectedField.prefillValue : "Signature preview"}
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <canvas
                            ref={fieldCanvasRef}
                            width={420}
                            height={120}
                            className="w-full touch-none rounded border border-border bg-bg"
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
                            className="rounded border border-border px-2 py-1 text-[11px] text-body"
                          >
                            Clear Drawing
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {selectedFieldValueType === "STAMP" ? (
                    <div className="mt-1 space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          void onStampUploadForSelectedField(event.target.files?.[0] ?? null);
                        }}
                        className="w-full rounded border border-border bg-bg px-2 py-1 text-text"
                      />
                      <textarea
                        value={selectedField.prefillValue ?? ""}
                        onChange={(event) => updateSelectedField({ prefillValue: event.target.value })}
                        placeholder="Paste stamp image URL, base64 image, or stamp text"
                        rows={2}
                        className="w-full rounded border border-border bg-bg px-2 py-1 text-text"
                      />
                      {selectedField.prefillValue && isImageLikeValue(selectedField.prefillValue) ? (
                        <div className="rounded border border-border bg-bg p-1">
                          <div
                            className="h-20 w-full bg-contain bg-center bg-no-repeat"
                            style={{ backgroundImage: `url("${selectedField.prefillValue}")` }}
                            aria-label="Stamp preview"
                            role="img"
                          />
                        </div>
                      ) : (
                        <div className="rounded border border-border bg-surface px-2 py-2 text-xs text-body">
                          {(selectedField.prefillValue ?? "").trim().length > 0 ? selectedField.prefillValue : "Stamp preview"}
                        </div>
                      )}
                    </div>
                  ) : null}
                  {selectedFieldValueType === "TEXT" ? (
                    <div className="mt-1 space-y-1">
                      <input
                        value={selectedField.prefillValue ?? ""}
                        maxLength={selectedFieldTextLimit}
                        placeholder={textTypePlaceholder(selectedField.type)}
                        onChange={(event) => onTextLikePrefillChange(event.target.value)}
                        onBlur={onTextLikePrefillBlur}
                        className={`w-full rounded border bg-bg px-2 py-1 text-text ${
                          selectedFieldIsEmailType && !selectedFieldEmailValid ? "border-rose-500" : "border-border"
                        }`}
                      />
                      <div className="flex items-center justify-between text-[10px] opacity-75">
                        <span>
                          {selectedField.type === "EMAIL_ADDRESS"
                            ? "Must be a valid email format."
                            : selectedField.type === "NAME" ||
                                selectedField.type === "FIRST_NAME" ||
                                selectedField.type === "LAST_NAME"
                              ? "Auto-formats capitalization on blur."
                              : "Prefill text for this field."}
                        </span>
                        <span>
                          {(selectedField.prefillValue ?? "").length}/{selectedFieldTextLimit}
                        </span>
                      </div>
                      {selectedFieldIsEmailType && !selectedFieldEmailValid ? (
                        <p className="text-[10px] text-rose-500">Please enter a valid email address.</p>
                      ) : null}
                    </div>
                  ) : null}
                </label>
                )}
                {selectedField.assignedRole === "SENDER" ? (
                <button
                  type="button"
                  aria-label="Reset selected field value"
                  onClick={() => {
                    updateSelectedField({ prefillValue: "" });
                    pushToast("Field value reset.", "success");
                  }}
                  className="inline-flex items-center gap-1 rounded border border-border bg-bg px-2 py-1.5 text-left text-body"
                >
                  <span aria-hidden>⟲</span>
                  Reset Field Value
                </button>
                ) : null}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedField.required ?? true}
                    onChange={(event) => updateSelectedField({ required: event.target.checked })}
                  />
                  Required
                </label>
                <details>
                  <summary className="cursor-pointer py-1 font-medium">Advanced</summary>
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedField.readOnly ?? false}
                        onChange={(event) => updateSelectedField({ readOnly: event.target.checked })}
                      />
                      Read only
                    </label>
                    <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
                      <p className="col-span-2 text-[11px] font-medium text-muted">Position &amp; size (% of page)</p>
                      <label className="text-[11px] text-body">
                        X
                        <input
                          type="text"
                          inputMode="decimal"
                          value={selectedField.x}
                          onChange={(event) => {
                            const x = Math.max(0, Math.min(Number(event.target.value) || 0, 100 - selectedField.width));
                            updateSelectedField({ x: Number(x.toFixed(2)) });
                          }}
                          className={`${controlClass} mt-0.5 w-full`}
                        />
                      </label>
                      <label className="text-[11px] text-body">
                        Y
                        <input
                          type="text"
                          inputMode="decimal"
                          value={selectedField.y}
                          onChange={(event) => {
                            const y = Math.max(0, Math.min(Number(event.target.value) || 0, 100 - selectedField.height));
                            updateSelectedField({ y: Number(y.toFixed(2)) });
                          }}
                          className={`${controlClass} mt-0.5 w-full`}
                        />
                      </label>
                      <label className="text-[11px] text-body">
                        Width
                        <input
                          type="text"
                          inputMode="decimal"
                          value={selectedField.width}
                          onChange={(event) => {
                            const w = Math.max(
                              FIELD_MIN_WIDTH_PERCENT,
                              Math.min(Number(event.target.value) || FIELD_MIN_WIDTH_PERCENT, 100 - selectedField.x),
                            );
                            updateSelectedField({ width: Number(w.toFixed(2)) });
                          }}
                          className={`${controlClass} mt-0.5 w-full`}
                        />
                      </label>
                      <label className="text-[11px] text-body">
                        Height
                        <input
                          type="text"
                          inputMode="decimal"
                          value={selectedField.height}
                          onChange={(event) => {
                            const h = Math.max(
                              FIELD_MIN_HEIGHT_PERCENT,
                              Math.min(Number(event.target.value) || FIELD_MIN_HEIGHT_PERCENT, 100 - selectedField.y),
                            );
                            updateSelectedField({ height: Number(h.toFixed(2)) });
                          }}
                          className={`${controlClass} mt-0.5 w-full`}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateSelectedField({ zIndex: Math.max(1, (selectedField.zIndex ?? 1) - 1) })}
                      className="inline-flex items-center justify-center gap-1 rounded border border-border bg-bg px-2 py-1.5 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label="Send selected field backward"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden />
                        Send Backward
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSelectedField({ zIndex: (selectedField.zIndex ?? 1) + 1 })}
                      className="inline-flex items-center justify-center gap-1 rounded border border-border bg-bg px-2 py-1.5 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label="Bring selected field forward"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden />
                        Bring Forward
                      </button>
                    </div>
                  </div>
                </details>
              </>
            )}
          </div>
          </div>
        </div>
      </div>
      ) : null}

      {step === 4 && !createdEnvelope ? (
      <div className="space-y-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-label uppercase">Review</p>
            <h3 className="text-heading text-lg">Confirm before creating envelope</h3>
            <p className="mt-1 text-sm text-body">Review recipients, fields, and settings. You can jump back to edit.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className={secondaryButtonClass}>
              Edit document
            </button>
            <button type="button" onClick={() => setStep(2)} className={secondaryButtonClass}>
              Edit recipients
            </button>
            <button type="button" onClick={() => setStep(3)} className={secondaryButtonClass}>
              Edit fields
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-bg p-4">
            <p className="text-label uppercase">Document</p>
            <p className="mt-1 text-sm font-semibold text-text">{documentOptions.find((d) => d.id === documentId)?.fileName ?? "Selected document"}</p>
            <p className="mt-1 text-xs text-muted">
              Expiry: <span className="font-medium text-text">{expiresInDays}</span> day(s)
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-bg p-4">
            <p className="text-label uppercase">Recipients</p>
            <div className="mt-2 space-y-2">
              {signers.map((s, idx) => (
                <div key={`review-recipient-${idx}`} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-text">
                      {idx + 1}. {s.name || "(Name)"}
                    </p>
                    <p className="truncate text-muted">{s.email || "(Email)"}</p>
                  </div>
                  <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-medium text-muted">
                    {s.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-bg p-4">
            <p className="text-label uppercase">Fields</p>
            <p className="mt-1 text-sm text-body">
              <span className="font-semibold text-text">{fields.length}</span> total field(s)
            </p>
            <div className="mt-2 space-y-2">
              {availableSignerEmails.map((email) => {
                const count = fields.filter((f) => f.signerEmail === email).length;
                return (
                  <div key={`review-fields-${email}`} className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs">
                    <p className="truncate text-text">{email}</p>
                    <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-semibold text-text">
                      {count}
                    </span>
                  </div>
                );
              })}
              {availableSignerEmails.length === 0 ? (
                <p className="text-xs text-muted">Add recipients with email addresses to see field summaries.</p>
              ) : null}
            </div>
          </div>
        </div>

      </div>
      ) : null}

      <div className={`flex flex-wrap items-center gap-3 ${createdEnvelope ? "hidden" : ""}`}>
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(1, current - 1))}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text shadow-sm transition hover:bg-surface/95"
            aria-label="Go back to previous step"
          >
            Back
          </button>
        ) : null}

        {step < 4 ? (
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => {
              if (step === 2) {
                const defaultRecipientEmail = placementRecipients[0]?.email ?? "";
                if (defaultRecipientEmail && selectedSignerEmailForPlacement.trim().length === 0) {
                  setSelectedSignerEmailForPlacement(defaultRecipientEmail);
                }
              }
              setStep((current) => Math.min(4, current + 1));
            }}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            aria-label="Continue to next step"
          >
            {nextButtonLabel}
          </button>
        ) : null}

        {step === 4 ? (
          <button
            type="button"
            disabled={submitting || documentOptions.length === 0 || hasDuplicateSignerEmails}
            onClick={() => void requestCreateEnvelope()}
            className={primaryButtonClass}
            aria-label="Create envelope"
          >
            {submitting ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
            {submitting ? "Creating..." : "Create Envelope"}
          </button>
        ) : null}
      </div>
      {step < 4 && !canContinue ? <p className="text-xs text-warning">{continueGuardMessage}</p> : null}

      {result && !createdEnvelope ? (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-text shadow-sm">
          <p className="text-label uppercase">Status</p>
          <p className="mt-1 whitespace-pre-wrap text-body">{result}</p>
        </div>
      ) : null}
      {senderSignModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-surface p-4 text-sm text-text shadow-2xl">
            <p className="text-base font-semibold">Sign As Sender Before Sending</p>
            <p className="text-xs opacity-80">
              Use this only if a sender signature or required stamp is still empty on the PDF. Values you already entered in Field Properties are kept.
            </p>
            <label className="block text-xs">
              Sender Signature
              <div className="mt-1 space-y-2 rounded-md border border-border bg-bg p-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSenderSignatureMode("TYPE")}
                    className={`rounded px-2 py-1 text-[11px] ${senderSignatureMode === "TYPE" ? "bg-primary text-white" : "border border-border text-body"}`}
                  >
                    Type
                  </button>
                  <button
                    type="button"
                    onClick={() => setSenderSignatureMode("DRAW")}
                    className={`rounded px-2 py-1 text-[11px] ${senderSignatureMode === "DRAW" ? "bg-primary text-white" : "border border-border text-body"}`}
                  >
                    Draw
                  </button>
                </div>
                {senderSignatureMode === "TYPE" ? (
                  <textarea
                    value={senderSignatureValue}
                    onChange={(event) => setSenderSignatureValue(event.target.value)}
                    rows={3}
                    placeholder="Type sender signature value"
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
                  />
                ) : (
                  <div className="space-y-2">
                    <canvas
                      ref={senderCanvasRef}
                      width={520}
                      height={130}
                      className="w-full touch-none rounded border border-border bg-bg"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        beginSenderDrawing(event.clientX, event.clientY);
                      }}
                      onPointerMove={(event) => {
                        event.preventDefault();
                        continueSenderDrawing(event.clientX, event.clientY);
                      }}
                      onPointerUp={(event) => {
                        event.preventDefault();
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        }
                        endSenderDrawing();
                      }}
                      onPointerLeave={() => {
                        endSenderDrawing();
                      }}
                      onPointerCancel={() => {
                        endSenderDrawing();
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const canvas = senderCanvasRef.current;
                          if (!canvas) return;
                          const context = canvas.getContext("2d");
                          if (!context) return;
                          context.fillStyle = "#ffffff";
                          context.fillRect(0, 0, canvas.width, canvas.height);
                          setSenderSignatureValue("");
                        }}
                        className="rounded border border-border px-2 py-1 text-[11px] text-body"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </label>
            <label className="block text-xs">
              Sender Seal (optional)
              <input
                value={senderSealValue}
                onChange={(event) => setSenderSealValue(event.target.value)}
                placeholder="Type sender seal text"
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
              />
            </label>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSenderSignModalOpen(false)}
                className="rounded-md border border-border bg-bg px-3 py-2 text-xs text-body"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  submitting ||
                  (senderModalNeedsSignature && !senderSignatureValue.trim()) ||
                  (senderModalNeedsStamp && !senderSealValue.trim())
                }
                onClick={async () => {
                  setSenderSignModalOpen(false);
                  await submitEnvelope();
                }}
                className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                Save & Create Envelope
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
