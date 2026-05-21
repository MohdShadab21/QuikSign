import type { OfficeConversionMethod } from "@/lib/documents/convert-office-to-pdf";

/** User-facing hint when conversion may not match Word Online / desktop Word. */
export function conversionQualityNote(method: string | null | undefined): string | null {
  switch (method) {
    case "libreoffice":
      return (
        "This PDF was created with LibreOffice. Fonts, logos, and highlights may look different from your Word file. " +
        "For an exact match: in Word Online use File → Download as PDF and upload that PDF, or ask IT to set up Microsoft Graph (docs/MICROSOFT_GRAPH_SETUP.md)."
      );
    case "gotenberg":
      return (
        "Converted with Gotenberg (LibreOffice in the cloud). Complex Word layouts may differ slightly. " +
        "For a perfect match, upload a PDF exported from Word Online."
      );
    case "microsoft-graph":
    case "microsoft-word":
    case "pdf-original":
      return null;
    default:
      return null;
  }
}

export function conversionMethodLabel(method: string | null | undefined): string {
  switch (method as OfficeConversionMethod | "pdf-original" | undefined) {
    case "microsoft-graph":
      return "Microsoft 365 / Word Online";
    case "microsoft-word":
      return "Microsoft Word (desktop)";
    case "libreoffice":
      return "LibreOffice";
    case "gotenberg":
      return "Gotenberg";
    case "pdf-original":
      return "Original PDF (no conversion)";
    default:
      return method ?? "unknown";
  }
}
