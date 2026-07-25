/**
 * Public status-page decision logic (docs/decisions.md, 2026-07-25; see also
 * docs/troubleshooting.md). Pure, DB-free — same split as
 * lib/supervisor-health.ts / lib/degraded-alerts.ts (db/health.ts is the
 * DB-touching half).
 *
 * Deliberately reuses those two modules' own staleness thresholds rather
 * than defining new ones — this page's "operational" must never silently
 * drift from whatever already pages a human via the supervisor-health /
 * degraded-alerts crons. Also deliberately coarse: three states, no
 * per-instance detail. This is public (specs/06-auth.md's gating map
 * already calls out a "status page" as public), so it only ever answers
 * "is the data plane up, and is anything currently misbehaving" — not
 * which customer's bot, or why. That detail lives in real logs on the box,
 * not a public page (docs/troubleshooting.md).
 */
import { HEARTBEAT_STALE_MS } from "./supervisor-health";
import { FRESHNESS_WINDOW_MS } from "./degraded-alerts";

export { HEARTBEAT_STALE_MS, FRESHNESS_WINDOW_MS };

export type SystemHealthStatus = "operational" | "degraded" | "down";

/** Checked in this order deliberately: a stale/missing heartbeat means the
 * supervisor isn't reconciling anything at all, which makes per-instance
 * event data moot underneath it — "down" always wins over "degraded". */
export function computeSystemHealth(
  lastHeartbeatAt: Date | null,
  hasRecentDegradedEvent: boolean,
  now: Date,
): SystemHealthStatus {
  const heartbeatStale = lastHeartbeatAt === null || now.getTime() - lastHeartbeatAt.getTime() > HEARTBEAT_STALE_MS;
  if (heartbeatStale) return "down";
  return hasRecentDegradedEvent ? "degraded" : "operational";
}
