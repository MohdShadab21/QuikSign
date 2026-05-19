"use client";

import { mapApiErrorMessage } from "@/lib/client/error-messages";

type JsonBody = Record<string, unknown>;

function getAuthHeaders(): Record<string, string> {
  const userId = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "user_1";
  const userEmail = process.env.NEXT_PUBLIC_DEMO_USER_EMAIL ?? "owner@company.com";
  const orgId = process.env.NEXT_PUBLIC_DEMO_ORG_ID ?? "org_demo";

  const headers: Record<string, string> = {
    "x-user-id": userId,
    "x-user-email": userEmail,
  };

  if (orgId) {
    headers["x-org-id"] = orgId;
  }

  return headers;
}

export async function appFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: unknown };
  if (!response.ok) {
    throw new Error(mapApiErrorMessage(data.error ?? `Request failed: ${response.status}`));
  }
  return data;
}

export function appAuthHeaders(): Record<string, string> {
  return getAuthHeaders();
}

export function withJsonHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...getAuthHeaders(),
    "content-type": "application/json",
    ...(extra ?? {}),
  };
}

export type AppJsonBody = JsonBody;
