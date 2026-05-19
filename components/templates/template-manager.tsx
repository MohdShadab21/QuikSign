"use client";

import { FormEvent, useState } from "react";
import { withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { useToast } from "@/components/ui/toast-provider";

type DocumentOption = {
  id: string;
  fileName: string;
};

export function TemplateManager({ documents }: { documents: DocumentOption[] }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");
  const [roleName, setRoleName] = useState("Primary Signer");
  const [role, setRole] = useState<"SIGNER" | "APPROVER" | "CC">("SIGNER");
  const [result, setResult] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { pushToast } = useToast();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setResult("");
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: withJsonHeaders(),
        body: JSON.stringify({
          name,
          description: description || undefined,
          documentId,
          signers: [{ roleName, role, signingOrder: 1 }],
          fields: [{ roleName, page: 1, x: 120, y: 620, width: 180, height: 55, type: "SIGNATURE" }],
        }),
      });
      const data = (await response.json()) as { error?: string; templateId?: string };
      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ?? "Template creation failed"));
      }
      setResult(`Template created: ${data.templateId}`);
      pushToast("Template created.", "success");
    } catch (error) {
      const friendly = mapApiErrorMessage((error as Error).message);
      setResult(friendly);
      pushToast(friendly, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <input
          required
          placeholder="Template name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-md border border-white/30 bg-white/70 px-3 py-2 text-sm dark:bg-zinc-900/50"
        />
        <select
          value={documentId}
          onChange={(event) => setDocumentId(event.target.value)}
          className="rounded-md border border-white/30 bg-white/70 px-3 py-2 text-sm dark:bg-zinc-900/50"
        >
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.fileName}
            </option>
          ))}
        </select>
        <input
          placeholder="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="rounded-md border border-white/30 bg-white/70 px-3 py-2 text-sm dark:bg-zinc-900/50 md:col-span-2"
        />
        <input
          placeholder="Role name (e.g. Legal Approver)"
          value={roleName}
          onChange={(event) => setRoleName(event.target.value)}
          className="rounded-md border border-white/30 bg-white/70 px-3 py-2 text-sm dark:bg-zinc-900/50"
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as "SIGNER" | "APPROVER" | "CC")}
          className="rounded-md border border-white/30 bg-white/70 px-3 py-2 text-sm dark:bg-zinc-900/50"
        >
          <option value="SIGNER">Signer</option>
          <option value="APPROVER">Approver</option>
          <option value="CC">CC</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting || documents.length === 0}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitting ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
        {submitting ? "Saving..." : "Create Template"}
      </button>
      {result && <p className="text-sm">{result}</p>}
    </form>
  );
}
