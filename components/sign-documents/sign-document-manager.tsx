"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { appAuthHeaders, withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { useToast } from "@/components/ui/toast-provider";

type DocumentItem = {
  id: string;
  fileName: string;
  signedDownloadUrl: string;
  createdAt: string;
  isSignedCopy: boolean;
  hasPlacedFields: boolean;
};

export function SignDocumentManager({ initialDocuments }: { initialDocuments: DocumentItem[] }) {
  const { pushToast } = useToast();
  const [documents, setDocuments] = useState(initialDocuments);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [shareDocId, setShareDocId] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareSignedOnly, setShareSignedOnly] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.fileName.toLowerCase().includes(q));
  }, [documents, query]);

  const refresh = async () => {
    const response = await fetch("/api/documents", { headers: appAuthHeaders() });
    const data = (await response.json()) as { error?: string; documents?: Array<{ id: string; fileName: string; signedDownloadUrl: string; createdAt: string }> };
    if (!response.ok) throw new Error(mapApiErrorMessage(data.error ?? "Failed to load documents"));
    setDocuments(
      (data.documents ?? []).map((d) => ({
        id: d.id,
        fileName: d.fileName,
        signedDownloadUrl: d.signedDownloadUrl,
        createdAt: d.createdAt,
        isSignedCopy: /-signed\.pdf$/i.test(d.fileName),
        hasPlacedFields: false,
      })),
    );
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/documents", { method: "POST", headers: appAuthHeaders(), body: formData });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(mapApiErrorMessage(data.error ?? "Upload failed"));
      setFile(null);
      await refresh();
      pushToast("Document uploaded.", "success");
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      const response = await fetch(`/api/documents/${id}`, { method: "DELETE", headers: withJsonHeaders() });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(mapApiErrorMessage(data.error ?? "Delete failed"));
      setDocuments((current) => current.filter((d) => d.id !== id));
      pushToast("Document deleted.", "success");
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    }
  };

  const share = async () => {
    if (!shareDocId || !shareEmail.trim()) return;
    try {
      const response = await fetch("/api/sign-documents/share", {
        method: "POST",
        headers: withJsonHeaders(),
        body: JSON.stringify({ documentId: shareDocId, toEmail: shareEmail.trim(), signedOnly: shareSignedOnly }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(mapApiErrorMessage(data.error ?? "Share failed"));
      setShareDocId(null);
      setShareEmail("");
      setShareSignedOnly(true);
      pushToast("Document shared by email.", "success");
    } catch (error) {
      pushToast(mapApiErrorMessage((error as Error).message), "error");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents…" />
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
          />
          <Button variant="primary" disabled={!file || uploading} onClick={() => void upload()}>
            {uploading ? "Uploading..." : "Upload Document"}
          </Button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-6 text-sm text-body">No documents yet. Upload a PDF or Word file to get started.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((doc) => (
            <Card key={doc.id} className="p-5">
              <p className="truncate text-base font-semibold text-text">{doc.fileName}</p>
              <p className="mt-1 text-xs text-muted">Created {new Date(doc.createdAt).toLocaleString()}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${doc.isSignedCopy ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300" : "border-blue-400/60 bg-blue-500/10 text-blue-300"}`}>
                  {doc.isSignedCopy ? "Signed" : "Original"}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${doc.hasPlacedFields ? "border-primary/60 bg-primary/10 text-primary" : "border-amber-400/60 bg-amber-500/10 text-amber-300"}`}>
                  {doc.hasPlacedFields ? "Fields Ready" : "No Fields Yet"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/sign-documents/${doc.id}/edit`} className="flex-1 min-w-[120px]">
                  <Button size="sm" variant="primary" className="w-full">Edit Document</Button>
                </Link>
                <a href={doc.signedDownloadUrl} target="_blank" rel="noreferrer" className="flex-1 min-w-[120px]">
                  <Button size="sm" className="w-full">Download PDF</Button>
                </a>
                <Button size="sm" onClick={() => setShareDocId(doc.id)} className="flex-1 min-w-[120px]">
                  Share
                </Button>
                <Button size="sm" variant="danger" onClick={() => void remove(doc.id)} className="flex-1 min-w-[120px]">
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {shareDocId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-5">
            <h3 className="text-heading text-lg">Share document</h3>
            <p className="mt-1 text-sm text-body">Enter recipient email address.</p>
            <Input className="mt-3" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="recipient@company.com" />
            <label className="mt-3 flex items-center gap-2 text-sm text-body">
              <input type="checkbox" checked={shareSignedOnly} onChange={(e) => setShareSignedOnly(e.target.checked)} />
              Share signed copy only
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                onClick={() => {
                  setShareDocId(null);
                  setShareSignedOnly(true);
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void share()}>
                Send
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

