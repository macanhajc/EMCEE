/** Tenant-scoped instance queries — every lookup filtered by user_id, no
 * "find by instance id" without an owner check (specs/05-security.md). */
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "./index";

export function listInstancesForUser(userId: string) {
  return db
    .select()
    .from(tables.botInstances)
    .where(eq(tables.botInstances.userId, userId))
    .orderBy(desc(tables.botInstances.createdAt));
}

export async function getOwnedInstance(userId: string, instanceId: string) {
  const [row] = await db
    .select()
    .from(tables.botInstances)
    .where(and(eq(tables.botInstances.id, instanceId), eq(tables.botInstances.userId, userId)));
  return row ?? null;
}
