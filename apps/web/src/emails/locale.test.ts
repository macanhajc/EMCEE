import { describe, expect, it } from "vitest";
import { resolveEmailLocale } from "./locale";

describe("resolveEmailLocale", () => {
  it("passes through a supported locale", () => {
    expect(resolveEmailLocale("pt")).toBe("pt");
  });

  it("falls back to the app default for null", () => {
    expect(resolveEmailLocale(null)).toBe("en");
  });

  it("falls back to the app default for an unsupported locale", () => {
    expect(resolveEmailLocale("fr")).toBe("en");
  });
});
