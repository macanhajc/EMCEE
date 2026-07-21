/** Warden's dashboard action log — most recent moderation events for one
 * instance (specs/bots/moderation.md). Reads the same `instance_events`
 * table every module's lifecycle events already land in (apps/web/src/db/schema.ts),
 * filtered to `kind = "moderation"` — Warden is the first module to actually
 * populate that kind. No filter-by-user/action UI in trimmed v1 — that's the
 * draft spec's fuller ambition, cut the same way raid guard was. */
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "./index";

const ACTIVITY_LOG_LIMIT = 20;

export function getRecentModerationEvents(botInstanceId: string) {
  return db
    .select({
      id: tables.instanceEvents.id,
      data: tables.instanceEvents.data,
      createdAt: tables.instanceEvents.createdAt,
    })
    .from(tables.instanceEvents)
    .where(and(eq(tables.instanceEvents.botInstanceId, botInstanceId), eq(tables.instanceEvents.kind, "moderation")))
    .orderBy(desc(tables.instanceEvents.createdAt))
    .limit(ACTIVITY_LOG_LIMIT);
}
