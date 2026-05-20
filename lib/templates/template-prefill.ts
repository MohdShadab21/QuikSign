import type { DesignerField } from "@/components/envelopes/pdf-field-designer";

/** Placeholder email used in template field designer (must match template builder). */
export function templateRoleEmail(roleName: string): string {
  const normalized = roleName.trim().toLowerCase().replaceAll(/\s+/g, ".");
  return `${normalized || "role"}@template.local`;
}

export type TemplateRoleInput = {
  roleName: string;
  role: "SIGNER" | "APPROVER" | "CC";
  signingOrder: number;
};

export type EnvelopeTemplatePrefill = {
  templateId: string;
  templateName: string;
  description: string;
  documentId: string;
  roles: TemplateRoleInput[];
  fields: DesignerField[];
};

type TemplateSignerRow = {
  id: string;
  roleName: string;
  role: string;
  signingOrder: number;
};

type TemplateFieldRow = {
  templateSignerId: string;
  label: string | null;
  required: boolean;
  readOnly: boolean;
  prefillValue: string | null;
  prefilledBySender: boolean;
  assignedRole: string;
  valueType: string;
  zIndex: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
};

export function buildEnvelopePrefillFromTemplate(template: {
  id: string;
  name: string;
  description: string | null;
  documentId: string;
  signers: TemplateSignerRow[];
  fields: TemplateFieldRow[];
}): EnvelopeTemplatePrefill {
  const signerById = new Map(template.signers.map((s) => [s.id, s]));

  const roles: TemplateRoleInput[] = template.signers.map((s) => ({
    roleName: s.roleName,
    role: s.role as TemplateRoleInput["role"],
    signingOrder: s.signingOrder,
  }));

  const fields: DesignerField[] = template.fields.map((f) => {
    const signer = signerById.get(f.templateSignerId);
    const roleName = signer?.roleName ?? template.signers[0]?.roleName ?? "Primary Signer";
    return {
      signerEmail: templateRoleEmail(roleName),
      label: f.label ?? "",
      required: f.required,
      readOnly: f.readOnly,
      prefillValue: f.prefillValue ?? "",
      prefilledBySender: f.prefilledBySender,
      assignedRole: f.assignedRole as DesignerField["assignedRole"],
      valueType: f.valueType as DesignerField["valueType"],
      zIndex: f.zIndex,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      type: f.type as DesignerField["type"],
    };
  });

  return {
    templateId: template.id,
    templateName: template.name,
    description: template.description ?? "",
    documentId: template.documentId,
    roles,
    fields,
  };
}
