import { describe, expect, it } from "vitest";
import { computeSystemHealth, HEARTBEAT_STALE_MS } from "./health";

const NOW = new Date("2026-07-25T21:00:00Z");
const msAgo = (ms: number) => new Date(NOW.getTime() - ms);

describe("computeSystemHealth", () => {
  it("is operational when the heartbeat is fresh and nothing is degraded", () => {
    expect(computeSystemHealth(msAgo(5_000), false, NOW)).toBe("operational");
  });

  it("is down when there has never been a heartbeat at all", () => {
    expect(computeSystemHealth(null, false, NOW)).toBe("down");
  });

  it("is down when the heartbeat is stale, even with no degraded event", () => {
    expect(computeSystemHealth(msAgo(HEARTBEAT_STALE_MS + 1), false, NOW)).toBe("down");
  });

  it("boundary: exactly at the stale threshold is still fresh (not down)", () => {
    expect(computeSystemHealth(msAgo(HEARTBEAT_STALE_MS), false, NOW)).toBe("operational");
  });

  it("is degraded when the heartbeat is fresh but a recent degraded event exists", () => {
    expect(computeSystemHealth(msAgo(5_000), true, NOW)).toBe("degraded");
  });

  it("down wins over degraded when both are true", () => {
    expect(computeSystemHealth(msAgo(HEARTBEAT_STALE_MS + 1), true, NOW)).toBe("down");
  });
});
