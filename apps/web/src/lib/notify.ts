import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Wakes the supervisor's reconcile loop after a config save
 * (specs/02-architecture.md), via Postgres `pg_notify` — LISTEN/NOTIFY on
 * the same database rather than a separate Redis pub/sub deploy
 * (docs/cost-plan.md, R6; Redis pub/sub before 2026-07-22). Postgres stays
 * the source of truth for the config itself — this carries only the
 * instance id, never the payload, so there's no dual-source-of-truth risk
 * if a notification is lost. Best-effort by design: "the loop makes it
 * correct even if pub/sub drops" (specs/04-bot-runtime.md), so a notify
 * failure must never fail the save.
 */
export async function publishConfigUpdated(instanceId: string): Promise<void> {
  try {
    await db.execute(sql`select pg_notify('config.updated', ${JSON.stringify({ instanceId })})`);
  } catch (err) {
    console.error("[notify] publish config.updated failed", err);
  }
}

/**
 * Wakes the supervisor after a dashboard-set avatar anchor spot
 * (specs/bots/avatar.md). Separate channel from config.updated: the saved
 * position lives in `avatar_positions`, not `bot_instances.config`, so a
 * plain config-update notification wouldn't tell the running bot to
 * re-teleport. Same best-effort posture as publishConfigUpdated — a dropped
 * notification just means the position takes effect on the instance's next
 * reconnect instead of immediately.
 */
export async function publishAvatarPositionUpdated(instanceId: string): Promise<void> {
  try {
    await db.execute(sql`select pg_notify('avatar_position.updated', ${JSON.stringify({ instanceId })})`);
  } catch (err) {
    console.error("[notify] publish avatar_position.updated failed", err);
  }
}

/**
 * Wakes the supervisor after the owner requests a ban/unban from the
 * dashboard (specs/bots/moderation.md's "proposed" section). Same best-effort
 * posture and same reason as the other two channels: `moderation_requests` is
 * the source of truth, this carries only the instance id, and a dropped
 * notification just means the request sits "pending" until the supervisor's
 * own reconcile-loop sweep picks it up (or the instance's next reconnect, if
 * it wasn't running yet) instead of applying immediately.
 */
export async function publishModerationRequested(instanceId: string): Promise<void> {
  try {
    await db.execute(sql`select pg_notify('moderation.requested', ${JSON.stringify({ instanceId })})`);
  } catch (err) {
    console.error("[notify] publish moderation.requested failed", err);
  }
}
