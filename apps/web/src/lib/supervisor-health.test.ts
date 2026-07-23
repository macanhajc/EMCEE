import { describe, expect, it } from "vitest";
import { decideSupervisorHealthAction, HEARTBEAT_STALE_MS, OPS_ALERT_COOLDOWN_MS } from "./supervisor-health";

const NOW = new Date("2026-07-23T21:00:00Z");
const msAgo = (ms: number) => new Date(NOW.getTime() - ms);

describe("decideSupervisorHealthAction", () => {
  it("does nothing when the heartbeat is fresh and there's no active alert", () => {
    expect(decideSupervisorHealthAction(msAgo(5_000), null, NOW)).toEqual({ type: "none" });
  });

  it("alerts when there has never been a heartbeat at all", () => {
    expect(decideSupervisorHealthAction(null, null, NOW)).toEqual({ type: "alert_down" });
  });

  it("alerts when the heartbeat is stale and no alert is active yet", () => {
    expect(decideSupervisorHealthAction(msAgo(HEARTBEAT_STALE_MS + 1), null, NOW)).toEqual({ type: "alert_down" });
  });

  it("boundary: exactly at the stale threshold is still fresh (not down)", () => {
    expect(decideSupervisorHealthAction(msAgo(HEARTBEAT_STALE_MS), null, NOW)).toEqual({ type: "none" });
  });

  it("does not re-alert while still down and inside the cooldown", () => {
    const active = { lastSentAt: msAgo(5 * 60_000) };
    expect(decideSupervisorHealthAction(msAgo(HEARTBEAT_STALE_MS + 1), active, NOW)).toEqual({ type: "none" });
  });

  it("sends a reminder once the cooldown elapses while still down", () => {
    const active = { lastSentAt: msAgo(OPS_ALERT_COOLDOWN_MS + 1) };
    expect(decideSupervisorHealthAction(msAgo(HEARTBEAT_STALE_MS + 1), active, NOW)).toEqual({ type: "alert_down" });
  });

  it("boundary: exactly at the cooldown is elapsed (inclusive)", () => {
    const active = { lastSentAt: msAgo(OPS_ALERT_COOLDOWN_MS) };
    expect(decideSupervisorHealthAction(msAgo(HEARTBEAT_STALE_MS + 1), active, NOW)).toEqual({ type: "alert_down" });
  });

  it("sends a recovery notice once healthy again after an active alert", () => {
    const active = { lastSentAt: msAgo(60_000) };
    expect(decideSupervisorHealthAction(msAgo(1_000), active, NOW)).toEqual({ type: "alert_recovered" });
  });

  it("does not send a recovery notice when healthy and nothing was ever alerted", () => {
    expect(decideSupervisorHealthAction(msAgo(1_000), null, NOW)).toEqual({ type: "none" });
  });
});
