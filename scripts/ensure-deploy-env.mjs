#!/usr/bin/env node
/**
 * Normalizes env vars before Prisma and Next.js build on Vercel.
 * - Maps Prisma Postgres / Vercel storage URLs → DATABASE_URL
 * - Sets NEXT_PUBLIC_APP_URL from VERCEL_* when missing or still localhost
 *
 * Safe locally: only fills gaps; does not override valid DATABASE_URL or production APP_URL.
 */

function isLocalhostUrl(url) {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

function normalizeAppUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, "");
}

/** Keys Vercel / Prisma Postgres may inject instead of DATABASE_URL */
const DATABASE_URL_FALLBACK_KEYS = [
  "POSTGRES_URL",
  "PRISMA_DATABASE_URL",
  "DATABASE_URL_POSTGRES_URL",
  "DATABASE_URL_PRISMA_DATABASE_URL",
  "DATABASE_URL_DATABASE_URL",
];

function resolveDatabaseUrl() {
  const existing = process.env.DATABASE_URL?.trim();
  if (existing) {
    return existing;
  }

  for (const key of DATABASE_URL_FALLBACK_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      process.env.DATABASE_URL = value;
      console.log(`[ensure-deploy-env] DATABASE_URL set from ${key}`);
      return value;
    }
  }

  return null;
}

function resolveAppUrl() {
  const isVercel = process.env.VERCEL === "1";
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const configuredOk = configured && !(isVercel && isLocalhostUrl(configured));

  if (configuredOk) {
    if (!process.env.APP_URL?.trim()) {
      process.env.APP_URL = normalizeAppUrl(configured);
    }
    return;
  }

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();

  if (vercelHost) {
    const url = normalizeAppUrl(vercelHost);
    process.env.NEXT_PUBLIC_APP_URL = url;
    process.env.APP_URL = url;
    console.log(`[ensure-deploy-env] NEXT_PUBLIC_APP_URL set to ${url}`);
    return;
  }

  if (isVercel) {
    console.warn(
      "[ensure-deploy-env] Warning: NEXT_PUBLIC_APP_URL not set and VERCEL_URL missing. " +
        "Add NEXT_PUBLIC_APP_URL in Vercel env vars.",
    );
  }
}

function main() {
  const db = resolveDatabaseUrl();
  resolveAppUrl();

  if (process.env.VERCEL === "1") {
    if (db) {
      console.log("[ensure-deploy-env] Database URL ready for Prisma");
    } else {
      console.warn(
        "[ensure-deploy-env] No DATABASE_URL found. Link Prisma Postgres / Postgres storage to this project, " +
          "or add DATABASE_URL manually.",
      );
    }
  }
}

main();
