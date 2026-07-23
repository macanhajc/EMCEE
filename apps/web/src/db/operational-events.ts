/** Dashboard-wide operational/lifecycle log — the supervisor's own event
 * stream (workers/runtime/supervisor.py's db.insert_event calls), separate
 * from Warden's moderation-specific log (warden-events.ts). Rendered on
 * every instance page regardless of which modules are active — this reads
 * connection/config lifecycle events every bot produces, not one module's. */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, tables } from "./index";

const OPERATIONAL_LOG_LIMIT = 20;

// Explicit whitelist, not "everything except a denylist" — a future new
// event kind (billing, moderation, degraded_alert_sent, ...) silently stays
// out of this customer-facing log unless someone deliberately adds it here.
const OPERATIONAL_EVENT_KINDS = [
  "degraded",
  "disconnected",
  "connect_timed_out",
  "token_unseal_failed",
  "stopped",
  "config_applied",
  "config_rejected",
] as const;

export function getRecentOperationalEvents(botInstanceId: string) {
  return db
    .select({
      id: tables.instanceEvents.id,
      kind: tables.instanceEvents.kind,
      data: tables.instanceEvents.data,
      createdAt: tables.instanceEvents.createdAt,
    })
    .from(tables.instanceEvents)
    .where(
      and(
        eq(tables.instanceEvents.botInstanceId, botInstanceId),
        inArray(tables.instanceEvents.kind, OPERATIONAL_EVENT_KINDS),
      ),
    )
    .orderBy(desc(tables.instanceEvents.createdAt))
    .limit(OPERATIONAL_LOG_LIMIT);
}
