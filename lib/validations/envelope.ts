import { z } from "zod";
import {
  FIELD_MIN_HEIGHT_PERCENT,
  FIELD_MIN_WIDTH_PERCENT,
} from "@/lib/envelopes/field-dimensions";

export const signerInputSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  signingOrder: z.number().int().min(1),
  role: z.enum(["SIGNER", "APPROVER", "CC"]).default("SIGNER"),
});

export const signatureFieldInputSchema = z.object({
  signerEmail: z.string().email(),
  label: z.string().max(120).optional(),
  required: z.boolean().optional().default(true),
  readOnly: z.boolean().optional().default(false),
  prefillValue: z.string().max(10_000_000).optional(),
  prefilledBySender: z.boolean().optional().default(false),
  assignedRole: z.enum(["SENDER", "RECIPIENT"]).optional().default("RECIPIENT"),
  valueType: z.enum(["TEXT", "DATE", "CHECKBOX", "SIGNATURE", "STAMP"]).optional(),
  zIndex: z.number().int().min(1).optional().default(1),
  page: z.number().int().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(FIELD_MIN_WIDTH_PERCENT),
  height: z.number().min(FIELD_MIN_HEIGHT_PERCENT),
  type: z
    .enum([
      "SIGNATURE",
      "SEAL",
      "INITIAL",
      "DATE",
      "NAME",
      "FIRST_NAME",
      "LAST_NAME",
      "EMAIL_ADDRESS",
      "COMPANY",
      "TITLE",
      "TEXT",
      "CHECKBOX",
    ])
    .default("SIGNATURE"),
});

export const createEnvelopeSchema = z.object({
  title: z.string().min(2).max(200),
  subject: z.string().max(250).optional(),
  message: z.string().max(5000).optional(),
  expiresInDays: z.number().int().min(1).max(60).default(7),
  documentId: z.string().uuid(),
  signers: z.array(signerInputSchema).min(1),
  fields: z.array(signatureFieldInputSchema).min(1),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  for (const signer of data.signers) {
    const normalized = signer.email.trim().toLowerCase();
    if (seen.has(normalized)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate signer email is not allowed: ${signer.email}`,
        path: ["signers"],
      });
      break;
    }
    seen.add(normalized);
  }
});

export const createTemplateSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  documentId: z.string().uuid(),
  signers: z.array(
    z.object({
      roleName: z.string().min(2).max(120),
      role: z.enum(["SIGNER", "APPROVER", "CC"]).default("SIGNER"),
      signingOrder: z.number().int().min(1),
    }),
  ).min(1),
  fields: z.array(
    z.object({
      roleName: z.string().min(2).max(120),
      label: z.string().max(120).optional(),
      required: z.boolean().optional().default(true),
      readOnly: z.boolean().optional().default(false),
      prefillValue: z.string().max(10_000_000).optional(),
      prefilledBySender: z.boolean().optional().default(false),
      assignedRole: z.enum(["SENDER", "RECIPIENT"]).optional().default("RECIPIENT"),
      valueType: z.enum(["TEXT", "DATE", "CHECKBOX", "SIGNATURE", "STAMP"]).optional(),
      zIndex: z.number().int().min(1).optional().default(1),
      page: z.number().int().min(1),
      x: z.number().min(0),
      y: z.number().min(0),
      width: z.number().min(FIELD_MIN_WIDTH_PERCENT),
      height: z.number().min(FIELD_MIN_HEIGHT_PERCENT),
      type: z
        .enum([
          "SIGNATURE",
          "SEAL",
          "INITIAL",
          "DATE",
          "NAME",
          "FIRST_NAME",
          "LAST_NAME",
          "EMAIL_ADDRESS",
          "COMPANY",
          "TITLE",
          "TEXT",
          "CHECKBOX",
        ])
        .default("SIGNATURE"),
    }),
  ).min(1),
});

export const signEnvelopeSchema = z.object({
  token: z.string().min(10),
  signatureType: z.enum(["DRAW", "TYPE", "UPLOAD"]),
  signatureValue: z.string().max(10_000_000).optional().default(""),
  initialValue: z.string().max(10_000_000).optional(),
  sealValue: z.string().max(10_000_000).optional(),
  consentAccepted: z.literal(true),
  fieldValues: z
    .array(
      z.object({
        fieldId: z.string().uuid(),
        value: z.string().max(10_000_000),
      }),
    )
    .optional()
    .default([]),
});

export const approveEnvelopeSchema = z.object({
  token: z.string().min(10),
  note: z.string().max(500).optional(),
});

export const voidEnvelopeSchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});

export const declineEnvelopeSchema = z.object({
  token: z.string().min(10),
  reason: z.string().min(3).max(500),
});

export const signingPresetQuerySchema = z.object({
  token: z.string().min(10),
});

export const createSigningPresetSchema = z.object({
  token: z.string().min(10),
  label: z.string().min(2).max(80),
  signatureValue: z.string().max(10_000_000).optional(),
  initialValue: z.string().max(10_000_000).optional(),
  sealValue: z.string().max(10_000_000).optional(),
  fontStyle: z.string().max(120).optional(),
}).refine(
  (data) =>
    Boolean(data.signatureValue?.trim()) ||
    Boolean(data.initialValue?.trim()) ||
    Boolean(data.sealValue?.trim()),
  { message: "Provide at least one of signature, initial, or seal value." },
);

export const updateSigningPresetSchema = z.object({
  token: z.string().min(10),
  presetId: z.string().uuid(),
  label: z.string().min(2).max(80),
});

export const deleteSigningPresetSchema = z.object({
  token: z.string().min(10),
  presetId: z.string().uuid(),
});

export const setDefaultSigningPresetSchema = z.object({
  token: z.string().min(10),
  presetId: z.string().uuid(),
});
