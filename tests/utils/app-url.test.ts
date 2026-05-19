import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { buildSigningUrl, getAppBaseUrl, isLocalhostUrl } from "@/lib/utils/app-url";

describe("app-url", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // NODE_ENV is read-only in TypeScript (@types/node) — do not delete it; tests use VERCEL=1 where needed.
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("detects localhost URLs", () => {
    expect(isLocalhostUrl("http://localhost:3030")).toBe(true);
    expect(isLocalhostUrl("https://quik-sign.vercel.app")).toBe(false);
  });

  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://quik-sign.vercel.app/";
    expect(getAppBaseUrl()).toBe("https://quik-sign.vercel.app");
    expect(buildSigningUrl("abc123")).toBe("https://quik-sign.vercel.app/sign/abc123");
  });

  it("ignores localhost NEXT_PUBLIC_APP_URL on Vercel and uses request host", () => {
    process.env.VERCEL = "1";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3030";
    const request = new NextRequest("https://quik-sign.vercel.app/api/envelopes", {
      headers: {
        host: "quik-sign.vercel.app",
        "x-forwarded-host": "quik-sign.vercel.app",
        "x-forwarded-proto": "https",
      },
    });
    expect(getAppBaseUrl(request)).toBe("https://quik-sign.vercel.app");
    expect(buildSigningUrl("token-xyz", request)).toBe("https://quik-sign.vercel.app/sign/token-xyz");
  });

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL without request", () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "quik-sign.vercel.app";
    expect(getAppBaseUrl()).toBe("https://quik-sign.vercel.app");
  });
});
