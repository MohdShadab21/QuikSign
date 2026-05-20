/** File name for the sign-document saved PDF (see `app/api/sign-documents/save`). */

export function isSignedCopyFileName(fileName: string): boolean {
  return /-signed\.pdf$/i.test(fileName);
}

export function signedCopyFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (isSignedCopyFileName(fileName)) {
    return fileName;
  }
  if (lower.endsWith(".pdf")) {
    return `${fileName.slice(0, -4)}-signed.pdf`;
  }
  return `${fileName}-signed.pdf`;
}
