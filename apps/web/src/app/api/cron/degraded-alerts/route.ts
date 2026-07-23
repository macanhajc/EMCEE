/**
 * Crash-loop alert sweep (specs/04-bot-runtime.md). Not gated by proxy.ts's
 * session check (route-access.ts's classifyRoute doesn't match "/api/cron",
 * same as the Stripe webhook) — auth here is the shared-secret header
 * check below, matching Vercel Cron's own documented pattern of sending
 * `Authorization: Bearer <CRON_SECRET>` automatically on every
 * cron-triggered request. A plain VPS crontab hitting this URL with the
 * same header works identically (specs/02-architecture.md's "Vercel or a
 * VPS" deployment duality).
 */
import { NextResponse } from "next/server";
import { getInstancesNeedingDegradedAlert, recordDegradedAlertSent } from "@/db/instance-alerts";
import { sendDegradedAlertEmail } from "@/lib/instance-alert-mailer";

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/degraded-alerts] CRON_SECRET not set");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const candidates = await getInstancesNeedingDegradedAlert();
  const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3000";

  let sent = 0;
  const failures: { instanceId: string; error: string }[] = [];

  for (const candidate of candidates) {
    try {
      await sendDegradedAlertEmail({
        to: candidate.userEmail,
        userName: candidate.userName,
        roomId: candidate.roomId,
        instanceId: candidate.instanceId,
        appOrigin,
        locale: candidate.userLocale,
      });
      // Only recorded on success — a failed send must retry next tick, not
      // get dedupe'd away as if the customer had already been told.
      await recordDegradedAlertSent(candidate.instanceId);
      sent++;
    } catch (err) {
      console.error(`[cron/degraded-alerts] failed for instance ${candidate.instanceId}`, err);
      failures.push({ instanceId: candidate.instanceId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ checked: candidates.length, sent, failed: failures.length, failures });
}
