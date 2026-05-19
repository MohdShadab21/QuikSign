import { NextRequest } from "next/server";

type Entry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Entry>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function checkRateLimit(
  request: NextRequest,
  keyPrefix: string,
  maxRequests = 30,
  windowMs = 60_000,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const ip = getClientIp(request);
  const key = `${keyPrefix}:${ip}`;
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const next: Entry = { count: 1, resetAt: now + windowMs };
    store.set(key, next);
    return { allowed: true, remaining: maxRequests - 1, resetAt: next.resetAt };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  store.set(key, existing);
  return { allowed: true, remaining: maxRequests - existing.count, resetAt: existing.resetAt };
}
