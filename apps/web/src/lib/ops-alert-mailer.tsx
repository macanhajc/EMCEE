/**
 * Delivery for the supervisor dead-man's-switch (docs/decisions.md,
 * 2026-07-23) — sibling to instance-alert-mailer.tsx, but addressed to us
 * (OPS_ALERT_EMAIL), never a customer. Same fallback discipline as every
 * other mailer here: unset config logs to the console outside production,
 * throws in production — a silently-not-alerting alert system is exactly
 * the failure this feature exists to prevent, and that's doubly true for
 * the alert whose whole job is telling us the rest of the alerting/runtime
 * stack might be down.
 */
import "server-only";
import type { ReactElement } from "react";
import { renderEmail } from "@/emails/render";
import {
  SUPERVISOR_DOWN_SUBJECT,
  SUPERVISOR_RECOVERED_SUBJECT,
  SupervisorDownEmail,
  SupervisorRecoveredEmail,
} from "@/emails/templates/supervisor-health";

function opsRecipients(): string[] {
  return (process.env.OPS_ALERT_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function sendOpsAlert(subject: string, node: ReactElement): Promise<void> {
  const to = opsRecipients();
  const apiKey = process.env.RESEND_API_KEY;

  if (to.length === 0 || !apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OPS_ALERT_EMAIL/RESEND_API_KEY not set — cannot send ops alerts in production");
    }
    console.log(`[dev] ops alert (${subject}) would send to ${to.join(", ") || "<OPS_ALERT_EMAIL unset>"}`);
    return;
  }

  const { html, text } = await renderEmail(node);
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "BotMarket <botmarket@codeswift.com.br>";

  const { error } = await resend.emails.send({ to, from, subject, text, html });
  if (error) {
    throw new Error(`Resend failed to send ops alert: ${error.message}`);
  }
}

export async function sendSupervisorDownAlert(input: { lastSeenAt: Date | null }): Promise<void> {
  await sendOpsAlert(SUPERVISOR_DOWN_SUBJECT, <SupervisorDownEmail lastSeenAt={input.lastSeenAt} />);
}

export async function sendSupervisorRecoveredAlert(): Promise<void> {
  await sendOpsAlert(SUPERVISOR_RECOVERED_SUBJECT, <SupervisorRecoveredEmail />);
}
