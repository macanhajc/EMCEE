import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("allows same-origin relative paths", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/instances/abc-123?tab=config")).toBe("/instances/abc-123?tab=config");
  });

  it.each([
    "https://evil.com",
    "http://evil.com/dashboard",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "",
    "dashboard", // missing leading slash
  ])("rejects %s and falls back", (input) => {
    expect(safeRedirectPath(input)).toBe("/dashboard");
  });

  it("rejects null/undefined", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
  });

  it("honors a custom fallback", () => {
    expect(safeRedirectPath("https://evil.com", "/login")).toBe("/login");
  });
});
