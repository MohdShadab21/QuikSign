"use client";

import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { appAuthHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { uiControlClass } from "@/lib/ui/classes";

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
      <label className="block text-sm font-medium text-text">
        PDF or Word file
        <input
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className={`${uiControlClass} file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white`}
        />
      </label>
      <Button type="submit" variant="primary" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {loading ? "Uploading…" : "Upload document"}
      </Button>
      {result ? <p className="text-sm text-body">{result}</p> : null}
    </form>
  );
}
