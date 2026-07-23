/**
 * Data-retention sweep (docs/cost-plan.md, R3). Same auth + deployment shape
 * as ../degraded-alerts: Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>` automatically, and a VPS crontab hitting the same URL with
 * that header works identically. Daily cadence (vercel.json / crontab).
 *
 * Each sweep runs independently — one failing must not stop the others —
 * and the response reports per-task outcomes so a partial failure is
 * visible in the cron log rather than silently skipped.
 */
import { NextResponse } from "next/server";
import {
  pruneExpiredSessions,
  pruneExpiredVerificationTokens,
  rollupAndPruneInstanceEvents,
  stripOldWebhookPayloads,
} from "@/db/retention";

const TASKS = {
  instanceEvents: rollupAndPruneInstanceEvents,
  webhookPayloads: stripOldWebhookPayloads,
  sessions: pruneExpiredSessions,
  verificationTokens: pruneExpiredVerificationTokens,
} as const;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/retention] CRON_SECRET not set");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: Partial<Record<keyof typeof TASKS, unknown>> = {};
  const failures: { task: string; error: string }[] = [];

  for (const [name, task] of Object.entries(TASKS) as [keyof typeof TASKS, () => Promise<unknown>][]) {
    try {
      results[name] = await task();
    } catch (err) {
      console.error(`[cron/retention] ${name} failed`, err);
      failures.push({ task: name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ results, failed: failures.length, failures });
}
