import { NextRequest, NextResponse } from "next/server";
import { enforceExternalAuth } from "@/middleware/auth";

export function proxy(request: NextRequest) {
  const rejection = enforceExternalAuth(request);
  if (rejection) {
    return rejection;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
