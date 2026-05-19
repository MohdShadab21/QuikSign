import { NextRequest, NextResponse } from "next/server";

const openApiPaths = ["/api/sign", "/api/sign/"];

export function enforceExternalAuth(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const isApiPath = pathname.startsWith("/api/");
  const isPublicSignRoute = openApiPaths.some((segment) => pathname.startsWith(segment));

  if (!isApiPath || isPublicSignRoute) {
    return null;
  }

  const userId = request.headers.get("x-user-id");
  const userEmail = request.headers.get("x-user-email");

  if (!userId || !userEmail) {
    return NextResponse.json(
      { error: "Missing required external auth headers: x-user-id, x-user-email" },
      { status: 401 },
    );
  }

  return null;
}
