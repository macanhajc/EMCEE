/**
 * Crash-loop email-alert candidates + dedupe marker. Dedup/timing logic
 * itself lives in lib/degraded-alerts.ts (pure, unit-tested); this module is
 * just the query that feeds it and the insert that records an alert sent.
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import { selectDegradedAlertInstanceIds } from "@/lib/degraded-alerts";
import { db, tables } from "./index";

// Bounds the scan; must comfortably exceed FRESHNESS_WINDOW_MS + COOLDOWN_MS
// (40 min) — 24h is pure headroom, not a correctness-affecting value.
const LOOKBACK_HOURS = 24;

export interface DegradedAlertCandidate {
  instanceId: string;
  roomId: string;
  userEmail: string;
  userName: string | null;
  userLocale: string | null;
}

export async function getInstancesNeedingDegradedAlert(now: Date = new Date()): Promise<DegradedAlertCandidate[]> {
  const since = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  const rows = await db
    .select({
      instanceId: tables.instanceEvents.botInstanceId,
      kind: tables.instanceEvents.kind,
      createdAt: tables.instanceEvents.createdAt,
      roomId: tables.botInstances.roomId,
      userEmail: tables.users.email,
      userName: tables.users.name,
      userLocale: tables.users.locale,
    })
    .from(tables.instanceEvents)
    .innerJoin(tables.botInstances, eq(tables.botInstances.id, tables.instanceEvents.botInstanceId))
    .innerJoin(tables.users, eq(tables.users.id, tables.botInstances.userId))
    .where(
      and(
        inArray(tables.instanceEvents.kind, ["degraded", "degraded_alert_sent"]),
        gte(tables.instanceEvents.createdAt, since),
        // Notifications card's email toggle (schema.ts) — an opted-out user
        // never becomes a candidate, so degraded_alert_sent dedupe markers
        // stay meaningless for them rather than needing special-casing.
        eq(tables.users.emailAlertsEnabled, true),
      ),
    );

  const ids = selectDegradedAlertInstanceIds(rows, now);
  if (ids.size === 0) return [];

  const candidates = new Map<string, DegradedAlertCandidate>();
  for (const row of rows) {
    if (ids.has(row.instanceId) && !candidates.has(row.instanceId)) {
      candidates.set(row.instanceId, {
        instanceId: row.instanceId,
        roomId: row.roomId,
        userEmail: row.userEmail,
        userName: row.userName,
        userLocale: row.userLocale,
      });
    }
  }
  return Array.from(candidates.values());
}

export function recordDegradedAlertSent(botInstanceId: string) {
  return db.insert(tables.instanceEvents).values({ botInstanceId, kind: "degraded_alert_sent", data: {} });
}
