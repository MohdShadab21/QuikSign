import type { DesignerField } from "@/components/envelopes/pdf-field-designer";

export type SigningFieldMeta = Pick<
  DesignerField,
  "signerEmail" | "assignedRole" | "prefilledBySender" | "readOnly"
> & {
  prefillValue?: string | null;
};

export function normalizeSignerEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Sender fields prefilled/locked before send — recipients cannot edit these. */
export function isSenderLockedField(field: SigningFieldMeta): boolean {
  return field.assignedRole === "SENDER" && Boolean(field.prefilledBySender || field.readOnly);
}

export function fieldBelongsToSigner(field: Pick<DesignerField, "signerEmail">, signerEmail: string): boolean {
  return normalizeSignerEmail(field.signerEmail) === normalizeSignerEmail(signerEmail);
}

export function canSignerEditField(field: SigningFieldMeta, activeSignerEmail: string): boolean {
  if (!activeSignerEmail.trim()) {
    return false;
  }
  if (!fieldBelongsToSigner(field, activeSignerEmail)) {
    return false;
  }
  if (isSenderLockedField(field)) {
    return false;
  }
  return true;
}

export function signingFieldBadge(field: SigningFieldMeta, activeSignerEmail: string): string {
  if (isSenderLockedField(field)) {
    return (field.prefillValue ?? "").trim() ? "Sender · signed" : "Sender · locked";
  }
  if (field.assignedRole === "SENDER") {
    return "Sender";
  }
  if (fieldBelongsToSigner(field, activeSignerEmail)) {
    return "Your field";
  }
  return "Recipient";
}

/** Label on the PDF during signing — prefers the name the sender set in field properties. */
export function signingFieldDisplayLabel(
  field: SigningFieldMeta & { label?: string | null; type?: string },
  activeSignerEmail: string,
): string {
  const custom = field.label?.trim();
  if (custom) {
    return custom;
  }
  const type = field.type?.replaceAll("_", " ") ?? "Field";
  const pretty = type.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
  if (fieldBelongsToSigner(field, activeSignerEmail)) {
    return pretty;
  }
  return signingFieldBadge(field, activeSignerEmail);
}

export function displayPrefillForSigner(
  field: SigningFieldMeta & { id?: string },
  activeSignerEmail: string,
  overrides: Record<string, string>,
): string {
  if (isSenderLockedField(field)) {
    return (field.prefillValue ?? "").trim();
  }
  if (!canSignerEditField(field, activeSignerEmail)) {
    return (field.prefillValue ?? "").trim();
  }
  const id = field.id ?? "";
  if (id && overrides[id]?.trim()) {
    return overrides[id].trim();
  }
  return (field.prefillValue ?? "").trim();
}
