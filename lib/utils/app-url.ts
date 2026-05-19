import type { NextRequest } from "next/server";

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, "");
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function isLocalhostUrl(url: string): boolean {
  try {
    return isLocalhostHostname(new URL(normalizeBaseUrl(url)).hostname);
  } catch {
    return false;
  }
}

function isDeployedRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function readConfiguredAppUrl(): string | null {
  const candidates = [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL];
  for (const raw of candidates) {
    const normalized = raw?.trim() ? normalizeBaseUrl(raw.trim()) : "";
    if (!normalized) continue;
    if (isDeployedRuntime() && isLocalhostUrl(normalized)) {
      continue;
    }
    return normalized;
  }
  return null;
}

function readVercelAppUrl(): string | null {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    return normalizeBaseUrl(production);
  }
  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) {
    return normalizeBaseUrl(deployment);
  }
  return null;
}

function readRequestAppUrl(request: NextRequest): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost ?? request.headers.get("host"))?.split(",")[0]?.trim();
  if (!host) return null;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto ||
    (isLocalhostHostname(host.split(":")[0] ?? host) ? "http" : "https");

  const base = normalizeBaseUrl(`${proto}://${host}`);
  if (isDeployedRuntime() && isLocalhostUrl(base)) {
    return null;
  }
  return base;
}

/**
 * Canonical public origin for signing links and emails.
 *
 * Resolution order:
 * 1. `NEXT_PUBLIC_APP_URL` or `APP_URL` from env (ignored on Vercel/production if localhost)
 * 2. Incoming request host (`x-forwarded-host` / `host`) when a NextRequest is provided
 * 3. `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL` on Vercel
 * 4. `http://localhost:3030` in local development only
 */
export function getAppBaseUrl(request?: NextRequest): string {
  const configured = readConfiguredAppUrl();
  if (configured) return configured;

  if (request) {
    const fromRequest = readRequestAppUrl(request);
    if (fromRequest) return fromRequest;
  }

  const fromVercel = readVercelAppUrl();
  if (fromVercel) return fromVercel;

  if (request) {
    const fromRequest = readRequestAppUrl(request);
    if (fromRequest) return fromRequest;
  }

  const port = process.env.PORT?.trim() || "3030";
  return `http://localhost:${port}`;
}

export function buildSigningUrl(token: string, request?: NextRequest): string {
  const base = getAppBaseUrl(request);
  return `${base}/sign/${encodeURIComponent(token)}`;
}
