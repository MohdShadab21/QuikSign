import { afterEach, describe, expect, it } from "vitest";
import { gotenbergConversionConfigured } from "@/lib/documents/convert-gotenberg";
import { microsoftGraphConversionConfigured } from "@/lib/documents/convert-microsoft-graph";

describe("office converter configuration", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it("detects Gotenberg URL", () => {
    process.env.GOTENBERG_URL = "https://gotenberg.example.com";
    expect(gotenbergConversionConfigured()).toBe(true);
  });

  it("detects Microsoft Graph credentials with drive id", () => {
    process.env.MS_GRAPH_TENANT_ID = "tenant";
    process.env.MS_GRAPH_CLIENT_ID = "client";
    process.env.MS_GRAPH_CLIENT_SECRET = "secret";
    process.env.MS_GRAPH_DRIVE_ID = "drive";
    expect(microsoftGraphConversionConfigured()).toBe(true);
  });

  it("detects Microsoft Graph credentials with site path", () => {
    delete process.env.MS_GRAPH_DRIVE_ID;
    process.env.MS_GRAPH_SITE_HOST = "contoso.sharepoint.com";
    process.env.MS_GRAPH_SITE_PATH = "/sites/QuikSign";
    expect(microsoftGraphConversionConfigured()).toBe(true);
  });
});
