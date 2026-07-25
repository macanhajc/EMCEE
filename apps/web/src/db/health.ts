/**
 * Public status-page queries (docs/decisions.md, 2026-07-25). Decision
 * logic lives in lib/health.ts; this is just the two reads that feed it.
 *
 * Reuses getLastHeartbeatAt from supervisor-health.ts (same signal the
 * dead-man's-switch cron already reads) rather than re-querying
 * supervisor_heartbeats a second, differently-written way.
 *
 * The degraded check is a lean existence probe against instance_events'
 * kind/time index (schema.ts's instance_events_kind_time_idx) — NOT
 * db/instance-alerts.ts's getInstancesNeedingDegradedAlert, which filters
 * by each user's own email-alert opt-out. That filter makes sense for "who
 * gets emailed"; it must not decide what a public status page shows, or a
 * customer opting out of email would make a real outage invisible here.
 *
 * If either query throws (e.g. Postgres itself is having a bad moment),
 * that counts as "down" too — a status page that 500s instead of saying
 * "down" during the very outage it exists to report is worse than useless.
 */
import { and, eq, gte } from "drizzle-orm";
import { getLastHeartbeatAt } from "./supervisor-health";
import { computeSystemHealth, FRESHNESS_WINDOW_MS, type SystemHealthStatus } from "@/lib/health";
import { db, tables } from "./index";

async function hasRecentDegradedEvent(since: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: tables.instanceEvents.id })
    .from(tables.instanceEvents)
    .where(and(eq(tables.instanceEvents.kind, "degraded"), gte(tables.instanceEvents.createdAt, since)))
    .limit(1);
  return row !== undefined;
}

export async function getSystemHealthStatus(now: Date = new Date()): Promise<SystemHealthStatus> {
  try {
    const since = new Date(now.getTime() - FRESHNESS_WINDOW_MS);
    const [lastHeartbeatAt, hasDegraded] = await Promise.all([getLastHeartbeatAt(), hasRecentDegradedEvent(since)]);
    return computeSystemHealth(lastHeartbeatAt, hasDegraded, now);
  } catch {
    return "down";
  }
}
