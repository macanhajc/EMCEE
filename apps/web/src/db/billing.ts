import { and, eq, inArray } from "drizzle-orm";
import { db, tables } from "./index";

const ACTIVE_ISH = ["trialing", "active", "past_due"] as const;

export async function getActiveSubscriptionForInstance(instanceId: string) {
  const [row] = await db
    .select()
    .from(tables.subscriptions)
    .where(
      and(eq(tables.subscriptions.botInstanceId, instanceId), inArray(tables.subscriptions.status, ACTIVE_ISH)),
    );
  return row ?? null;
}

/** Batched form of getActiveSubscriptionForInstance, for list views (dashboard). */
export async function getActiveSubscriptionsForInstances(instanceIds: string[]) {
  if (instanceIds.length === 0) return new Map<string, Awaited<ReturnType<typeof getActiveSubscriptionForInstance>>>();
  const rows = await db
    .select()
    .from(tables.subscriptions)
    .where(
      and(inArray(tables.subscriptions.botInstanceId, instanceIds), inArray(tables.subscriptions.status, ACTIVE_ISH)),
    );
  return new Map(rows.map((row) => [row.botInstanceId as string, row]));
}

/** Trial-abuse dedupe (specs/06-auth.md): has this room+token combination already run a trial? */
export async function hasUsedTrial(roomId: string, tokenFingerprint: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tables.trialRegistry.id })
    .from(tables.trialRegistry)
    .where(
      and(eq(tables.trialRegistry.roomId, roomId), eq(tables.trialRegistry.tokenFingerprint, tokenFingerprint)),
    );
  return row !== undefined;
}
