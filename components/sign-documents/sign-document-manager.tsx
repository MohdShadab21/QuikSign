"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Search } from "lucide-react";
import { isSignedCopyFileName, signedCopyFileName } from "@/lib/documents/signed-copy-name";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTableShell, TablePagination } from "@/components/ui/data-table";
import { DocumentsTable } from "@/components/sign-documents/documents-table";
import { Input } from "@/components/ui/input";
import { appAuthHeaders, withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { useToast } from "@/components/ui/toast-provider";
import { uiControlClass } from "@/lib/ui/classes";

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
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

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const shareSourceDoc = useMemo(
    () => (shareDocId ? documents.find((d) => d.id === shareDocId) ?? null : null),
    [documents, shareDocId],
  );

  const shareSignedCopyDoc = useMemo(() => {
    if (!shareSourceDoc) return null;
    if (shareSourceDoc.isSignedCopy) return shareSourceDoc;
    const signedName = signedCopyFileName(shareSourceDoc.fileName);
    return documents.find((d) => d.fileName === signedName) ?? null;
  }, [documents, shareSourceDoc]);

  const openShareModal = (doc: DocumentItem) => {
    setShareDocId(doc.id);
    setShareEmail("");
    const signedName = signedCopyFileName(doc.fileName);
    const hasSignedCopy = doc.isSignedCopy || documents.some((d) => d.fileName === signedName);
    setShareSignedOnly(hasSignedCopy);
  };

  const refresh = async () => {
    const response = await fetch("/api/documents", { headers: appAuthHeaders() });
    const data = (await response.json()) as {
      error?: string;
      documents?: Array<{ id: string; fileName: string; signedDownloadUrl: string; createdAt: string }>;
    };
    if (!response.ok) throw new Error(mapApiErrorMessage(data.error ?? "Failed to load documents"));
    setDocuments(
      (data.documents ?? []).map((d) => ({
        id: d.id,
        fileName: d.fileName,
        signedDownloadUrl: d.signedDownloadUrl,
        createdAt: d.createdAt,
        isSignedCopy: isSignedCopyFileName(d.fileName),
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
    <div className="w-full min-w-0 space-y-4">
      <DataTableShell
        footer={
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        }
      >
        <div className="border-b border-border bg-bg/50 px-4 py-3">
          <p className="mb-3 text-xs text-muted">
            {filtered.length} document{filtered.length === 1 ? "" : "s"}
          </p>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search documents..."
              className="pl-9"
            />
          </div>
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={`${uiControlClass} !mt-0`}
          />
          <Button variant="primary" disabled={!file || uploading} onClick={() => void upload()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {uploading ? "Uploading..." : "Upload"}
          </Button>
          </div>
        </div>
        <DocumentsTable rows={paginated} onShare={openShareModal} onDelete={(id) => void remove(id)} />
      </DataTableShell>

      {shareDocId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h3 className="text-heading text-lg">Share document</h3>
            <p className="mt-1 text-sm text-body">Enter recipient email address.</p>
            <Input
              className="mt-3"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="recipient@company.com"
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                checked={shareSignedOnly}
                disabled={!shareSignedCopyDoc}
                onChange={(e) => setShareSignedOnly(e.target.checked)}
              />
              Share signed copy only
            </label>
            {shareSignedOnly && shareSignedCopyDoc ? (
              <p className="mt-1 text-xs text-muted">Will send: {shareSignedCopyDoc.fileName}</p>
            ) : null}
            {shareSourceDoc && !shareSignedCopyDoc ? (
              <p className="mt-1 text-xs text-warning">
                No signed copy yet. Sign and save the document to enable sharing the signed PDF.
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
