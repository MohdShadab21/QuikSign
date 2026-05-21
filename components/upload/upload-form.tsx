"use client";

import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { appAuthHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { useDocumentFileInput } from "@/lib/client/document-file-input";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { uiControlClass } from "@/lib/ui/classes";
import { DOCUMENT_UPLOAD_ACCEPT } from "@/lib/documents/pdf-upload-policy";
import { validateDocumentUploadFile } from "@/lib/client/validate-document-upload";

export function UploadForm() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const { pushToast } = useToast();
  const {
    inputRef,
    inputKey,
    selectedFile,
    onFileChange,
    resetInput,
    getFileForUpload,
  } = useDocumentFileInput();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = getFileForUpload();
    if (!file) {
      setResult("Please select a PDF or Word file first.");
      pushToast("Please select a PDF or Word file first.", "error");
      return;
    }

    const validationError = validateDocumentUploadFile(file);
    if (validationError) {
      setResult(validationError);
      pushToast(validationError, "error");
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

      setResult(`Uploaded successfully: ${data.document?.fileName ?? file.name}`);
      pushToast("Document uploaded successfully.", "success");
      resetInput();
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
          key={inputKey}
          ref={inputRef}
          type="file"
          accept={DOCUMENT_UPLOAD_ACCEPT}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          className={`${uiControlClass} file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white`}
        />
      </label>
      {selectedFile ? (
        <p className="text-xs text-muted">Selected: {selectedFile.name}</p>
      ) : null}
      <Button type="submit" variant="primary" disabled={loading || !selectedFile}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {loading ? "Converting & uploading…" : "Upload document"}
      </Button>
      {result ? <p className="text-sm text-body">{result}</p> : null}
    </form>
  );
}
