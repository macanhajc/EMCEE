import { describe, expect, it } from "vitest";
import { classifyRoute, requiresAgeAttestation } from "./route-access";

describe("classifyRoute", () => {
  it.each([
    ["/", "public"],
    ["/pricing", "public"],
    ["/bots/emote", "public"],
    ["/status", "public"],
    ["/login", "public"],
  ] as const)("%s is public", (path, expected) => {
    expect(classifyRoute(path)).toBe(expected);
  });

  it.each([
    "/checkout",
    "/checkout/emote",
    "/instances/new",
    "/instances/abc-123",
    "/dashboard",
    "/dashboard/activity",
    "/account/billing",
  ])("%s requires auth", (path) => {
    expect(classifyRoute(path)).toBe("auth");
  });

  it.each(["/admin", "/admin/tenants", "/admin/kill-switch"])("%s requires admin", (path) => {
    expect(classifyRoute(path)).toBe("admin");
  });

  it("the attestation page itself is reachable while signed in, without re-gating", () => {
    expect(classifyRoute("/account/attest-age")).toBe("auth");
  });
});

describe("requiresAgeAttestation", () => {
  it.each(["/checkout", "/checkout/emote", "/instances/new"])("%s is age-gated", (path) => {
    expect(requiresAgeAttestation(path)).toBe(true);
  });

  it.each([
    "/dashboard",
    "/instances/abc-123", // managing an existing instance isn't a new purchase
    "/account/billing",
    "/",
  ])("%s is not age-gated", (path) => {
    expect(requiresAgeAttestation(path)).toBe(false);
  });
});
