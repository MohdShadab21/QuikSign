export type EnvelopeStatusKey = "DRAFT" | "SENT" | "COMPLETED" | "DECLINED" | "VOIDED" | "EXPIRED";

export function envelopeStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "SENT":
      return "Sent";
    case "COMPLETED":
      return "Completed";
    case "DECLINED":
      return "Declined";
    case "VOIDED":
      return "Voided";
    case "EXPIRED":
      return "Expired";
    default:
      return status;
  }
}

export function envelopeStatusBadgeClass(status: string): string {
  if (status === "COMPLETED") return "bg-primary text-white";
  if (status === "SENT") return "bg-warning/90 text-white";
  if (status === "DRAFT") return "bg-primary/80 text-white";
  if (status === "DECLINED" || status === "VOIDED" || status === "EXPIRED") return "bg-danger text-white";
  return "bg-muted/20 text-text";
}
