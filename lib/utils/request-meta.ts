import { NextRequest } from "next/server";

export function getRequestMeta(req: NextRequest): { ipAddress: string | null; userAgent: string | null } {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = req.headers.get("user-agent");

  return { ipAddress, userAgent };
}
