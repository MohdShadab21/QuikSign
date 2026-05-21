import { useCallback, useRef, useState } from "react";

/** Avoids stale browser file inputs (wrong file uploaded after cancel/re-pick). */
export function useDocumentFileInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputKey, setInputKey] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onFileChange = useCallback((file: File | null) => {
    setSelectedFile(file);
  }, []);

  const resetInput = useCallback(() => {
    setSelectedFile(null);
    setInputKey((k) => k + 1);
  }, []);

  /** Prefer live input.files over React state (state can lag after re-pick). */
  const getFileForUpload = useCallback((): File | null => {
    return inputRef.current?.files?.[0] ?? selectedFile;
  }, [selectedFile]);

  return {
    inputRef,
    inputKey,
    selectedFile,
    onFileChange,
    resetInput,
    getFileForUpload,
  };
}
