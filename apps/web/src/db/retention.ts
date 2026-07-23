/**
 * Data-retention sweeps (docs/cost-plan.md, R3) — keeps the append-only
 * tables from growing without bound so the database never outgrows its box.
 * Run by /api/cron/retention (daily); every function is safe to re-run and
 * a no-op when there's nothing old enough to touch.
 */
import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * instance_events older than this are rolled up + deleted; webhook_events
 * older than this lose their raw payload. 90 days per the retention line in
 * specs/05-security.md — comfortably past Stripe's ~30-day event retention,
 * while the rollups keep per-day evidence for card-chargeback windows that
 * outlive it.
 */
export const RETENTION_DAYS = 90;

/** postgres-js returns the command's affected-row count on the result. */
function affected(result: unknown): number {
  const count = (result as { count?: unknown })?.count;
  return typeof count === "number" ? count : 0;
}

/**
 * Folds events past the retention window into instance_event_rollups
 * (per instance × day × kind counts), then deletes them — one transaction,
 * so a failure between the two statements can't lose history, and `now()`
 * (fixed per transaction in Postgres) gives both statements the same cutoff.
 * ON CONFLICT adds to an existing rollup row: a kind can land on the same
 * day twice when a sweep was skipped and catches up later.
 */
export async function rollupAndPruneInstanceEvents(): Promise<{ pruned: number }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO instance_event_rollups (bot_instance_id, day, kind, count)
      SELECT bot_instance_id, created_at::date, kind, count(*)::int
      FROM instance_events
      WHERE created_at < now() - (${RETENTION_DAYS} * interval '1 day')
      GROUP BY bot_instance_id, created_at::date, kind
      ON CONFLICT (bot_instance_id, day, kind)
      DO UPDATE SET count = instance_event_rollups.count + excluded.count
    `);
    const deleted = await tx.execute(sql`
      DELETE FROM instance_events
      WHERE created_at < now() - (${RETENTION_DAYS} * interval '1 day')
    `);
    return { pruned: affected(deleted) };
  });
}

/**
 * Replaces old raw Stripe payloads with a small marker. The rows themselves
 * are never deleted — webhook_events' PK on the Stripe event id is the
 * webhook handler's idempotency check, so deleting a row would re-open it
 * to replay (specs/03-billing.md).
 */
export async function stripOldWebhookPayloads(): Promise<{ stripped: number }> {
  const result = await db.execute(sql`
    UPDATE webhook_events
    SET payload = '{"_pruned": true}'::jsonb
    WHERE received_at < now() - (${RETENTION_DAYS} * interval '1 day')
      AND payload->>'_pruned' IS NULL
  `);
  return { stripped: affected(result) };
}

/**
 * Expired sessions are already invalid (Auth.js checks `expires` on read);
 * the rows of customers who simply never came back just sit there forever
 * otherwise.
 */
export async function pruneExpiredSessions(): Promise<{ pruned: number }> {
  const result = await db.execute(sql`DELETE FROM sessions WHERE expires < now()`);
  return { pruned: affected(result) };
}

/** Magic-link tokens expire after 15 minutes (src/auth.ts); Auth.js deletes
 * used ones itself, but never-clicked links linger until swept. */
export async function pruneExpiredVerificationTokens(): Promise<{ pruned: number }> {
  const result = await db.execute(sql`DELETE FROM verification_tokens WHERE expires < now()`);
  return { pruned: affected(result) };
}
