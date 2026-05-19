const FRIENDLY_ERROR_MAPPINGS: Array<{ match: string; message: string }> = [
  {
    match: "Server schema is out of sync",
    message: "System update in progress. Please wait a few seconds and try again.",
  },
  {
    match: "Envelope creation failed",
    message: "Unable to create envelope right now. Please retry.",
  },
];

function apiErrorToString(error: unknown): string {
  if (error === null || error === undefined) {
    return "Request failed.";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    if ("formErrors" in o || "fieldErrors" in o) {
      const formErrors = Array.isArray(o.formErrors) ? (o.formErrors as string[]) : [];
      const fieldErrors =
        o.fieldErrors && typeof o.fieldErrors === "object" ? (o.fieldErrors as Record<string, string[] | undefined>) : {};
      const parts: string[] = [...formErrors];
      for (const [key, msgs] of Object.entries(fieldErrors)) {
        if (Array.isArray(msgs) && msgs.length > 0) {
          parts.push(`${key}: ${msgs.join(", ")}`);
        }
      }
      if (parts.length > 0) {
        return parts.join(" · ");
      }
    }
    if ("message" in o && typeof o.message === "string") {
      return o.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Request failed.";
    }
  }
  return String(error);
}

export function mapApiErrorMessage(message: unknown): string {
  const normalized = apiErrorToString(message).trim();
  for (const mapping of FRIENDLY_ERROR_MAPPINGS) {
    if (normalized.includes(mapping.match)) {
      return mapping.message;
    }
  }
  return normalized;
}

export function toFriendlyError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return new Error(mapApiErrorMessage(error.message || fallbackMessage));
  }
  return new Error(mapApiErrorMessage(fallbackMessage));
}
