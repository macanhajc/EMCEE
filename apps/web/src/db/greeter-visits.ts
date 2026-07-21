/** Concierge's dashboard "regulars" table (specs/bots/greeter.md) — top
 * visitors to one instance's room, only counting recent activity so a
 * long-closed room doesn't keep showing stale names forever. */
import { and, desc, eq, gte } from "drizzle-orm";
import { db, tables } from "./index";

const REGULARS_WINDOW_DAYS = 30;
const REGULARS_LIMIT = 10;

export function getRegulars(botInstanceId: string) {
  const since = new Date(Date.now() - REGULARS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return db
    .select({
      username: tables.greeterVisits.username,
      visitCount: tables.greeterVisits.visitCount,
      lastSeenAt: tables.greeterVisits.lastSeenAt,
    })
    .from(tables.greeterVisits)
    .where(and(eq(tables.greeterVisits.botInstanceId, botInstanceId), gte(tables.greeterVisits.lastSeenAt, since)))
    .orderBy(desc(tables.greeterVisits.visitCount))
    .limit(REGULARS_LIMIT);
}
