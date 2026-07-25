/**
 * Crash-loop alert delivery, sibling to mailer.tsx (which is scoped to the
 * Nodemailer auth provider specifically — this isn't that). Same fallback
 * discipline: unset RESEND_API_KEY logs to the console in dev, throws in
 * production — a silently-not-alerting alert system is exactly the failure
 * this feature exists to prevent.
 *
 * Never receives anything token-shaped (specs/05-security.md) — only
 * instance/room identifiers, by construction of this function's input type.
 *
 * Locale: this fires from a cron sweep, not a page request, so there's no
 * next-intl request context to read — callers pass the user's last-seen
 * locale (users.locale) and resolveEmailLocale() falls back to the app
 * default when it's unknown.
 */
import "server-only";
import { resolveEmailLocale } from "@/emails/locale";
import { renderEmail } from "@/emails/render";
import { DegradedAlertEmail, degradedAlertEmailSubject } from "@/emails/templates/degraded-alert";

export interface DegradedAlertInput {
  to: string;
  userName: string | null;
  roomId: string;
  instanceId: string;
  appOrigin: string;
  locale: string | null;
}

export async function sendDegradedAlertEmail(input: DegradedAlertInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const link = `${input.appOrigin}/instances/${input.instanceId}`;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set — cannot send crash alerts in production");
    }
    console.log(`[dev] degraded alert for ${input.to}, room ${input.roomId}: ${link}`);
    return;
  }

  const locale = resolveEmailLocale(input.locale);
  const { html, text } = await renderEmail(
    <DegradedAlertEmail userName={input.userName} roomId={input.roomId} link={link} locale={locale} />,
  );

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "BotMarket <botmarket@codeswift.com.br>";

  const { error } = await resend.emails.send({
    to: input.to,
    from,
    subject: await degradedAlertEmailSubject(input.roomId, locale),
    text,
    html,
  });

  if (error) {
    throw new Error(`Resend failed to send degraded alert: ${error.message}`);
  }
}
