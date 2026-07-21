/** Avatar module's saved anchor spot (specs/bots/avatar.md) — one row per
 * instance in `avatar_positions`, the same table the in-game "anchor" chat
 * command writes to. Deliberately not part of `bot_instances.config`: see
 * the spec's "No coordinates ever live in config" note. */
import { eq } from "drizzle-orm";
import { db, tables } from "./index";

export interface AvatarPosition {
  x: number;
  y: number;
  z: number;
  facing: string;
}

export async function getAvatarPosition(botInstanceId: string): Promise<AvatarPosition | null> {
  const [row] = await db
    .select({
      x: tables.avatarPositions.x,
      y: tables.avatarPositions.y,
      z: tables.avatarPositions.z,
      facing: tables.avatarPositions.facing,
    })
    .from(tables.avatarPositions)
    .where(eq(tables.avatarPositions.botInstanceId, botInstanceId));
  return row ?? null;
}

export async function setAvatarPosition(botInstanceId: string, position: AvatarPosition): Promise<void> {
  await db
    .insert(tables.avatarPositions)
    .values({ botInstanceId, ...position })
    .onConflictDoUpdate({ target: tables.avatarPositions.botInstanceId, set: position });
}
