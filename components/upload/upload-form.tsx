"use client";

import { FormEvent, useState } from "react";
import { appAuthHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { useToast } from "@/components/ui/toast-provider";

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const { pushToast } = useToast();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setResult("Please select a PDF or Word file first.");
      pushToast("Please select a PDF or Word file first.", "error");
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/documents", {
        method: "POST",
        headers: appAuthHeaders(),
        body: formData,
      });

      const data = (await response.json()) as { error?: string; document?: { id: string; fileName: string } };
      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ?? "Upload failed"));
      }

      setResult(`Uploaded successfully: ${data.document?.fileName ?? "document"}`);
      pushToast("Document uploaded successfully.", "success");
      setFile(null);
    } catch (error) {
      const friendly = mapApiErrorMessage((error as Error).message);
      setResult(friendly);
      pushToast(friendly, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-xl border border-white/20 bg-white/20 p-4 dark:bg-zinc-900/20">
        <label className="text-sm font-medium">
          PDF or Word
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="mt-2 block w-full rounded-md border border-white/30 bg-white/70 px-3 py-2 text-sm dark:bg-zinc-900/50"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
        {loading ? "Uploading..." : "Upload Document"}
      </button>
      {result && <p className="text-sm">{result}</p>}
    </form>
  );
}
