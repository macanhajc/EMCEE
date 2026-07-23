/**
 * Supervisor dead-man's-switch decision logic (docs/decisions.md,
 * 2026-07-23) — pure, DB-free, mirrors the split lib/degraded-alerts.ts
 * already uses (tricky timing behavior unit-tested without Postgres). The
 * DB-touching half lives in db/supervisor-health.ts.
 *
 * Distinct problem from degraded-alerts.ts: that alert fires from *inside*
 * the supervisor's own reconcile loop, so it can only ever catch a bot that
 * is crash-looping while the loop is running. A supervisor that never
 * starts (bad env var, code error before Supervisor.run()) or hangs never
 * produces a single instance_events row for anything — nothing in that
 * system can see it. This instead watches workers/runtime/supervisor.py's
 * own heartbeat (written every reconcile tick, ~10s) and alerts when it
 * goes stale, regardless of whether any bot_instance exists at all.
 */

// Supervisor writes a heartbeat every RECONCILE_INTERVAL_S (10s,
// workers/runtime/supervisor.py). 9x that cadence is stale enough to mean
// "the process is actually gone," not just "a slightly slow tick."
export const HEARTBEAT_STALE_MS = 90_000;

// Reminder cadence while the outage continues, and the minimum gap between
// two "still down" emails — same shape as degraded-alerts.ts's COOLDOWN_MS.
export const OPS_ALERT_COOLDOWN_MS = 30 * 60_000;

export interface ActiveOpsAlert {
  lastSentAt: Date;
}

export type SupervisorHealthAction =
  | { type: "none" }
  | { type: "alert_down" }
  | { type: "alert_recovered" };

/** What (if anything) the cron sweep should do right now, given the latest
 * known heartbeat and whether a "down" alert is currently active. */
export function decideSupervisorHealthAction(
  lastHeartbeatAt: Date | null,
  activeAlert: ActiveOpsAlert | null,
  now: Date,
): SupervisorHealthAction {
  const isDown = lastHeartbeatAt === null || now.getTime() - lastHeartbeatAt.getTime() > HEARTBEAT_STALE_MS;

  if (isDown) {
    if (!activeAlert) return { type: "alert_down" };
    const cooldownElapsed = now.getTime() - activeAlert.lastSentAt.getTime() >= OPS_ALERT_COOLDOWN_MS;
    return cooldownElapsed ? { type: "alert_down" } : { type: "none" };
  }

  return activeAlert ? { type: "alert_recovered" } : { type: "none" };
}
