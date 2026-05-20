"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { DesignerField } from "@/components/envelopes/pdf-field-designer";
import { appAuthHeaders } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const PdfFieldDesigner = dynamic(
  () => import("@/components/envelopes/pdf-field-designer").then((mod) => mod.PdfFieldDesigner),
  { ssr: false, loading: () => <p className="text-sm text-body">Loading preview…</p> },
);

export type PreviewField = {
  id: string;
  signerEmail: string;
  signerName: string;
  signerStatus: string;
  signerSignedAt: string | null;
  signerSignatureValue: string | null;
  signerSealValue: string | null;
  assignedRole: string;
  prefilledBySender: boolean;
  prefillValue: string;
  readOnly: boolean;
  valueType: string;
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  required: boolean;
  label: string;
};

export type PreviewSigner = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  signingOrder: number;
  signedAt: string | null;
  declinedAt: string | null;
  viewedAt: string | null;
  signatureValue: string | null;
  sealValue: string | null;
};

export type PreviewEnvelope = {
  id: string;
  title: string;
  status: string;
  sentAt: string | null;
  completedAt: string | null;
  voidedAt: string | null;
  declinedReason: string | null;
  voidReason: string | null;
  documentFileName: string;
  documentUrl: string;
  signedDocumentAvailable: boolean;
  signers: PreviewSigner[];
  fields: PreviewField[];
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.round(diff / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function signerBadgeClasses(status: string): string {
  if (status === "SIGNED") return "bg-success/10 text-success";
  if (status === "DECLINED") return "bg-danger/10 text-danger";
  if (status === "VIEWED") return "bg-primary/10 text-primary";
  return "bg-muted/10 text-muted";
}

function pickDisplayValue(field: PreviewField): string {
  const ownValue = (field.prefillValue ?? "").toString();
  // Sender pre-fills always show
  if (field.prefilledBySender && ownValue.trim().length > 0) {
    return ownValue;
  }
  // For text/checkbox/date fields, use the stored prefillValue
  if (field.valueType === "TEXT" || field.valueType === "DATE" || field.valueType === "CHECKBOX") {
    return ownValue;
  }
  // For signature/initial/stamp fields filled during signing
  const signedAt = field.signerSignedAt;
  if (!signedAt) {
    return ownValue;
  }
  if (ownValue.trim().length > 0) {
    return ownValue;
  }
  if (field.valueType === "STAMP" || field.type === "SEAL") {
    return field.signerSealValue ?? "";
  }
  return field.signerSignatureValue ?? "";
}

export function EnvelopePreviewClient({ envelope }: { envelope: PreviewEnvelope }) {
  const [placementPage, setPlacementPage] = useState(1);
  const previewHeaders = useMemo(() => appAuthHeaders(), []);

  const designerFields: DesignerField[] = useMemo(
    () =>
      envelope.fields.map((field) => ({
        id: field.id,
        signerEmail: field.signerEmail,
        label: field.label,
        required: field.required,
        readOnly: true,
        prefillValue: pickDisplayValue(field),
        prefilledBySender: field.prefilledBySender,
        assignedRole: (field.assignedRole === "SENDER" ? "SENDER" : "RECIPIENT") as DesignerField["assignedRole"],
        valueType: (["TEXT", "DATE", "CHECKBOX", "SIGNATURE", "STAMP"].includes(field.valueType)
          ? field.valueType
          : "TEXT") as DesignerField["valueType"],
        zIndex: field.zIndex,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        type: field.type as DesignerField["type"],
      })),
    [envelope.fields],
  );

  const noop = () => {};

  const signedCount = envelope.signers.filter((s) => s.status === "SIGNED").length;
  const totalSigners = envelope.signers.filter((s) => s.role !== "CC").length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-body">
          <span>
            Document: <strong className="text-text">{envelope.documentFileName}</strong>
          </span>
          <span>
            Status: <strong className="text-text">{envelope.status}</strong> · {signedCount}/{totalSigners} signed
          </span>
        </div>
        <PdfFieldDesigner
          documentUrl={envelope.documentUrl}
          documentRequestHeaders={previewHeaders}
          selectedSignerEmail=""
          prefillEditingMode="all"
          placementPage={placementPage}
          fields={designerFields}
          onAddField={noop}
          onUpdateField={noop}
          onDeleteField={noop}
          onClearPage={noop}
          onUndo={noop}
          canUndo={false}
          onPlacementPageChange={setPlacementPage}
          readOnly
          minimalViewerChrome
          showZoomControls
          fieldLabelMode="clean"
        />
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-label uppercase">Timeline</p>
          <ul className="mt-2 space-y-1 text-xs text-body">
            <li>Sent {formatRelative(envelope.sentAt)}</li>
            {envelope.completedAt ? <li>Completed {formatRelative(envelope.completedAt)}</li> : null}
            {envelope.voidedAt ? <li>Voided {formatRelative(envelope.voidedAt)}</li> : null}
          </ul>
          {envelope.declinedReason ? (
            <p className="mt-2 rounded bg-danger/10 px-2 py-1 text-[11px] text-danger">
              Decline reason: {envelope.declinedReason}
            </p>
          ) : null}
          {envelope.voidReason ? (
            <p className="mt-2 rounded bg-danger/10 px-2 py-1 text-[11px] text-danger">
              Void reason: {envelope.voidReason}
            </p>
          ) : null}
          {envelope.signedDocumentAvailable ? (
            <a
              href={`/api/envelopes/${envelope.id}/packet`}
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-border bg-bg px-3 py-2 text-xs text-body hover:bg-surface"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download signed packet
            </a>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-label uppercase">Recipients</p>
          <ul className="mt-2 space-y-2">
            {envelope.signers.map((signer) => (
              <li
                key={signer.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg px-2 py-1"
              >
                <div className="min-w-0">
                  <p className="truncate text-text">
                    <span className="font-medium">{signer.name}</span>{" "}
                    <span className="text-muted">&lt;{signer.email}&gt;</span>
                  </p>
                  <p className="text-[10px] text-muted">
                    Order {signer.signingOrder} · {signer.role}
                    {signer.signedAt ? ` · Signed ${formatRelative(signer.signedAt)}` : ""}
                    {signer.declinedAt ? ` · Declined ${formatRelative(signer.declinedAt)}` : ""}
                    {signer.viewedAt && !signer.signedAt && !signer.declinedAt
                      ? ` · Viewed ${formatRelative(signer.viewedAt)}`
                      : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${signerBadgeClasses(signer.status)}`}>
                  {signer.status}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-label uppercase">Actions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/dashboard">
              <Button size="sm" variant="secondary">
                Back to dashboard
              </Button>
            </Link>
            <a href={envelope.documentUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                Open source PDF
              </Button>
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}
