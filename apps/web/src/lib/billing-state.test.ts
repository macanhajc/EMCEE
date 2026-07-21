import { describe, expect, it } from "vitest";
import { mapSubscriptionStatus, resolveDesiredState } from "./billing-state";

describe("mapSubscriptionStatus", () => {
  it.each([
    ["trialing", "trialing", "running"],
    ["active", "active", "running"],
    ["past_due", "past_due", "running"],
    ["canceled", "canceled", "stopped"],
    ["unpaid", "suspended", "stopped"],
    ["paused", "suspended", "stopped"],
    ["incomplete", "suspended", "stopped"],
    ["incomplete_expired", "suspended", "stopped"],
  ] as const)("maps Stripe status %s -> our status %s, desiredState %s", (stripeStatus, status, desiredState) => {
    expect(mapSubscriptionStatus(stripeStatus)).toEqual({ status, desiredState });
  });

  it("throws on an unrecognized status rather than silently defaulting", () => {
    expect(() => mapSubscriptionStatus("some_future_stripe_status")).toThrow(/unrecognized/);
  });

  it("every non-terminal status keeps the bot running (only suspended/canceled stop it)", () => {
    const running = ["trialing", "active", "past_due"];
    const stopped = ["canceled", "unpaid", "paused", "incomplete", "incomplete_expired"];
    for (const s of running) expect(mapSubscriptionStatus(s).desiredState).toBe("running");
    for (const s of stopped) expect(mapSubscriptionStatus(s).desiredState).toBe("stopped");
  });
});

describe("resolveDesiredState", () => {
  it.each([
    ["running", true, "running"],
    ["running", false, "stopped"],
    ["stopped", true, "stopped"],
    ["stopped", false, "stopped"],
  ] as const)("entitlement %s + userEnabled %s -> %s", (entitlement, userEnabled, expected) => {
    expect(resolveDesiredState(entitlement, userEnabled)).toBe(expected);
  });
});
