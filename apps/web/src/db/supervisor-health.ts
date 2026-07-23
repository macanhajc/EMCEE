/**
 * Supervisor dead-man's-switch (docs/decisions.md, 2026-07-23) — reads the
 * heartbeat workers/runtime/supervisor.py writes every reconcile tick, and
 * the dedup marker for the ops-only "supervisor down" alert. Decision logic
 * itself lives in lib/supervisor-health.ts (pure, unit-tested); this module
 * is just the queries that feed it and record an alert sent/cleared.
 */
import { eq, sql } from "drizzle-orm";
import { db, tables } from "./index";

export async function getLastHeartbeatAt(): Promise<Date | null> {
  // MAX across every supervisor_id, not a single row lookup — correct for
  // today's single-VPS deploy (one supervisor process); see the schema
  // comment on supervisorHeartbeats for the multi-shard caveat.
  //
  // Raw `sql` expression, not a typed column select — Drizzle's date
  // decoding only applies to actual table columns (it's driven by the
  // column definition's `mode`), so postgres.js's raw text-format
  // timestamptz string comes through here verbatim. Parse it ourselves.
  const [row] = await db
    .select({ lastSeenAt: sql<string | null>`max(${tables.supervisorHeartbeats.lastSeenAt})` })
    .from(tables.supervisorHeartbeats);
  return row?.lastSeenAt ? new Date(row.lastSeenAt) : null;
}

const SUPERVISOR_DOWN_ALERT_KIND = "supervisor_down";

export async function getActiveSupervisorDownAlert(): Promise<{ lastSentAt: Date } | null> {
  const [row] = await db
    .select({ lastSentAt: tables.opsAlerts.lastSentAt })
    .from(tables.opsAlerts)
    .where(eq(tables.opsAlerts.kind, SUPERVISOR_DOWN_ALERT_KIND))
    .limit(1);
  return row ?? null;
}

export async function recordSupervisorDownAlertSent(now: Date = new Date()): Promise<void> {
  await db
    .insert(tables.opsAlerts)
    .values({ kind: SUPERVISOR_DOWN_ALERT_KIND, lastSentAt: now })
    .onConflictDoUpdate({ target: tables.opsAlerts.kind, set: { lastSentAt: now } });
}

export async function clearSupervisorDownAlert(): Promise<void> {
  await db.delete(tables.opsAlerts).where(eq(tables.opsAlerts.kind, SUPERVISOR_DOWN_ALERT_KIND));
}
