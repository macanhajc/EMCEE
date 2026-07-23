/**
 * Supervisor dead-man's-switch sweep (docs/decisions.md, 2026-07-23). Same
 * auth pattern as the other /api/cron/* routes (shared-secret bearer
 * header — see degraded-alerts/route.ts's header comment for why proxy.ts's
 * session gate doesn't apply here). Runs every minute (deploy/crontab,
 * vercel.json) — tighter than degraded-alerts' 5-minute cadence, since this
 * failure mode takes every customer bot down at once, not just one.
 */
import { NextResponse } from "next/server";
import {
  clearSupervisorDownAlert,
  getActiveSupervisorDownAlert,
  getLastHeartbeatAt,
  recordSupervisorDownAlertSent,
} from "@/db/supervisor-health";
import { sendSupervisorDownAlert, sendSupervisorRecoveredAlert } from "@/lib/ops-alert-mailer";
import { decideSupervisorHealthAction } from "@/lib/supervisor-health";

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/supervisor-health] CRON_SECRET not set");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [lastHeartbeatAt, activeAlert] = await Promise.all([getLastHeartbeatAt(), getActiveSupervisorDownAlert()]);
  const action = decideSupervisorHealthAction(lastHeartbeatAt, activeAlert, new Date());

  if (action.type === "alert_down") {
    await sendSupervisorDownAlert({ lastSeenAt: lastHeartbeatAt });
    await recordSupervisorDownAlertSent();
  } else if (action.type === "alert_recovered") {
    await sendSupervisorRecoveredAlert();
    await clearSupervisorDownAlert();
  }

  return NextResponse.json({ action: action.type, lastHeartbeatAt });
}
