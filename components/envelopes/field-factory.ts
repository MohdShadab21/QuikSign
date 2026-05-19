import type { DesignerField } from "@/components/envelopes/pdf-field-designer";
import {
  FIELD_DEFAULT_HEIGHT_PERCENT,
  FIELD_DEFAULT_WIDTH_PERCENT,
} from "@/lib/envelopes/field-dimensions";

export function defaultValueType(type: DesignerField["type"]): NonNullable<DesignerField["valueType"]> {
  if (type === "DATE") return "DATE";
  if (type === "CHECKBOX") return "CHECKBOX";
  if (type === "SEAL") return "STAMP";
  if (type === "SIGNATURE" || type === "INITIAL") return "SIGNATURE";
  return "TEXT";
}

export function buildDefaultField(input: {
  type: DesignerField["type"];
  signerEmail: string;
  page: number;
  x?: number;
  y?: number;
  zIndex: number;
  label?: string;
}): DesignerField {
  return {
    signerEmail: input.signerEmail,
    label: input.label ?? "",
    required: true,
    readOnly: false,
    prefillValue: "",
    prefilledBySender: false,
    assignedRole: "RECIPIENT",
    valueType: defaultValueType(input.type),
    zIndex: input.zIndex,
    page: input.page,
    x: input.x ?? 12,
    y: input.y ?? 60,
    width: FIELD_DEFAULT_WIDTH_PERCENT,
    height: FIELD_DEFAULT_HEIGHT_PERCENT,
    type: input.type,
  };
}

export const fieldFactoryDefaults = {
  width: FIELD_DEFAULT_WIDTH_PERCENT,
  height: FIELD_DEFAULT_HEIGHT_PERCENT,
};
