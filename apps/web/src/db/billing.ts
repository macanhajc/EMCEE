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

export interface SubscriptionContact {
  userEmail: string;
  userName: string | null;
  userLocale: string | null;
  roomId: string;
}

/** Who to email about a subscription event (payment-failed alert) — joins through to the owning user. */
export async function getSubscriptionContact(botInstanceId: string): Promise<SubscriptionContact | null> {
  const [row] = await db
    .select({
      userEmail: tables.users.email,
      userName: tables.users.name,
      userLocale: tables.users.locale,
      roomId: tables.botInstances.roomId,
    })
    .from(tables.botInstances)
    .innerJoin(tables.users, eq(tables.users.id, tables.botInstances.userId))
    .where(eq(tables.botInstances.id, botInstanceId));
  return row ?? null;
}
