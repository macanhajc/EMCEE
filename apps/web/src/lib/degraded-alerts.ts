/**
 * Crash-loop email-alert dedup logic (specs/04-bot-runtime.md's "N
 * consecutive failures -> degraded, alert" promise) — pure, DB-free so the
 * tricky timing behavior is unit-testable without Postgres. The DB-touching
 * half lives in db/instance-alerts.ts.
 *
 * Keys off instance_events rows, not bot_instances.status: status is
 * written optimistically at the start of every (re)connect attempt
 * (workers/runtime/supervisor.py's _run_instance_loop), so it bounces
 * running<->degraded during an ongoing crash loop instead of holding level.
 * A `kind: "degraded"` event, by contrast, is only ever inserted on an
 * actual escalation, so its timestamp is the reliable signal.
 *
 * Also: while a bot keeps crash-looping, a NEW "degraded" event lands on
 * every backoff cycle (every few seconds up to every 5 min once the backoff
 * cap is hit) — it is not one-time/edge-triggered. Without dedup this would
 * alert every cron tick for as long as the outage lasts.
 */

export interface InstanceEventRow {
  instanceId: string;
  kind: string;
  createdAt: Date;
}

// ~5-minute cron cadence + margin: a "degraded" event older than this is
// treated as stale (the bot likely recovered since — the supervisor simply
// stops inserting new ones once it stops crash-looping).
export const FRESHNESS_WINDOW_MS = 10 * 60_000;

// Reminder cadence while an outage is ongoing, and the minimum gap between
// two alerts for the same instance. Measured from the last alert *sent*,
// not from outage onset — a recovery-then-re-crash inside this window
// defers the reminder rather than firing instantly. A true "new incident"
// detector would need episode/gap-grouping over the full event history;
// more machinery than a v1 crash alert needs (see specs/04-bot-runtime.md
// Open Questions).
export const COOLDOWN_MS = 30 * 60_000;

/** Returns the instanceIds that should get a degraded-crash-loop email right now. */
export function selectDegradedAlertInstanceIds(events: InstanceEventRow[], now: Date): Set<string> {
  const latestDegraded = new Map<string, number>();
  const latestAlertSent = new Map<string, number>();

  for (const event of events) {
    const t = event.createdAt.getTime();
    const bucket = event.kind === "degraded" ? latestDegraded : event.kind === "degraded_alert_sent" ? latestAlertSent : null;
    if (!bucket) continue;
    const prev = bucket.get(event.instanceId);
    if (prev === undefined || t > prev) bucket.set(event.instanceId, t);
  }

  const nowMs = now.getTime();
  const result = new Set<string>();
  for (const [instanceId, degradedAt] of latestDegraded) {
    if (nowMs - degradedAt > FRESHNESS_WINDOW_MS) continue; // stale — looks recovered, don't (re)alert

    const alertAt = latestAlertSent.get(instanceId);
    if (alertAt !== undefined) {
      const newerThanLastAlert = degradedAt > alertAt;
      const cooldownElapsed = nowMs - alertAt >= COOLDOWN_MS;
      if (!(newerThanLastAlert && cooldownElapsed)) continue;
    }

    result.add(instanceId);
  }
  return result;
}
