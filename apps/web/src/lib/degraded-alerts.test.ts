import { describe, expect, it } from "vitest";
import { COOLDOWN_MS, FRESHNESS_WINDOW_MS, selectDegradedAlertInstanceIds, type InstanceEventRow } from "./degraded-alerts";

const NOW = new Date("2026-07-21T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function ev(instanceId: string, kind: string, minsAgo: number): InstanceEventRow {
  return { instanceId, kind, createdAt: minutesAgo(minsAgo) };
}

describe("selectDegradedAlertInstanceIds", () => {
  it("alerts on a fresh degraded event with no prior alert", () => {
    const ids = selectDegradedAlertInstanceIds([ev("a", "degraded", 2)], NOW);
    expect(ids).toEqual(new Set(["a"]));
  });

  it("does not alert a second time inside the cooldown window", () => {
    const events = [ev("a", "degraded", 2), ev("a", "degraded_alert_sent", 5)];
    expect(selectDegradedAlertInstanceIds(events, NOW)).toEqual(new Set());
  });

  it("sends a reminder once the cooldown has elapsed and a newer degraded event exists", () => {
    const events = [ev("a", "degraded", 2), ev("a", "degraded_alert_sent", 35)];
    expect(selectDegradedAlertInstanceIds(events, NOW)).toEqual(new Set(["a"]));
  });

  it("does not alert when the only degraded event is stale (looks recovered)", () => {
    const events = [ev("a", "degraded", 15)];
    expect(selectDegradedAlertInstanceIds(events, NOW)).toEqual(new Set());
  });

  it("keeps instances independent — no cross-instance leakage", () => {
    const events = [
      ev("a", "degraded", 2), // fresh, never alerted -> included
      ev("b", "degraded", 2),
      ev("b", "degraded_alert_sent", 5), // inside cooldown -> excluded
    ];
    expect(selectDegradedAlertInstanceIds(events, NOW)).toEqual(new Set(["a"]));
  });

  it("does not re-alert when the last alert is newer than the last degraded event", () => {
    // e.g. alert just sent, and a stray older degraded row is still in the lookback window.
    const events = [ev("a", "degraded", 8), ev("a", "degraded_alert_sent", 1)];
    expect(selectDegradedAlertInstanceIds(events, NOW)).toEqual(new Set());
  });

  it("boundary: exactly at the freshness window is still fresh (inclusive)", () => {
    const events = [ev("a", "degraded", FRESHNESS_WINDOW_MS / 60_000)];
    expect(selectDegradedAlertInstanceIds(events, NOW)).toEqual(new Set(["a"]));
  });

  it("boundary: exactly at the cooldown is elapsed (inclusive)", () => {
    const events = [ev("a", "degraded", 2), ev("a", "degraded_alert_sent", COOLDOWN_MS / 60_000)];
    expect(selectDegradedAlertInstanceIds(events, NOW)).toEqual(new Set(["a"]));
  });

  it("ignores unrelated event kinds", () => {
    const events = [ev("a", "config_applied", 1), ev("a", "disconnected", 1)];
    expect(selectDegradedAlertInstanceIds(events, NOW)).toEqual(new Set());
  });
});
