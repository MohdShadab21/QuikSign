import { headers } from "next/headers";

export type RequestUser = {
  userId: string;
  userEmail: string;
  orgId?: string;
};

export async function getRequestUser(): Promise<RequestUser> {
  const h = await headers();
  const userId = h.get("x-user-id");
  const userEmail = h.get("x-user-email");
  const orgId = h.get("x-org-id") ?? undefined;

  if (!userId || !userEmail) {
    throw new Error("Missing external auth headers");
  }

  return { userId, userEmail, orgId };
}
