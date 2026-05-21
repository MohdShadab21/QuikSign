import { describe, expect, it } from "vitest";
import { resolveWinWordExePaths } from "@/lib/documents/detect-microsoft-word";

describe("resolveWinWordExePaths", () => {
  it("returns an array without throwing", () => {
    expect(Array.isArray(resolveWinWordExePaths())).toBe(true);
  });
});
