import { getRequestUser, type RequestUser } from "@/lib/auth/request-user";

/**
 * Auth for server components: use request headers when present (e.g. behind a trusted proxy),
 * otherwise fall back to demo env vars so SSR matches client `appAuthHeaders()` behavior.
 */
export async function getServerAuthContext(): Promise<RequestUser> {
  try {
    return await getRequestUser();
  } catch {
    const userId = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "user_1";
    const userEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL ?? "owner@company.com";
    const orgId = process.env.NEXT_PUBLIC_DEMO_ORG_ID?.trim() || undefined;
    return { userId, userEmail, orgId };
  }
}
