/**
 * invoice.payment_failed alert, sibling to instance-alert-mailer.tsx. Same
 * fallback discipline: unset RESEND_API_KEY logs to the console in dev,
 * throws in production. Fires from the Stripe webhook handler
 * (api/webhooks/stripe/route.ts), which has no next-intl request context
 * either — same locale-fallback approach as the crash-alert mailer.
 *
 * Never receives anything token-shaped (specs/05-security.md) — only
 * contact info and an already-formatted amount, by construction of this
 * function's input type.
 */
import "server-only";
import { resolveEmailLocale } from "@/emails/locale";
import { renderEmail } from "@/emails/render";
import { PaymentFailedEmail, paymentFailedEmailSubject } from "@/emails/templates/payment-failed";

export interface PaymentFailedInput {
  to: string;
  userName: string | null;
  roomId: string;
  instanceId: string;
  appOrigin: string;
  locale: string | null;
  amountDue: number; // smallest currency unit, as Stripe's invoice.amount_due
  currency: string; // ISO 4217, lowercase, as Stripe's invoice.currency
}

export async function sendPaymentFailedEmail(input: PaymentFailedInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const link = `${input.appOrigin}/instances/${input.instanceId}`;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set — cannot send payment-failed alerts in production");
    }
    console.log(`[dev] payment-failed alert for ${input.to}, room ${input.roomId}: ${link}`);
    return;
  }

  const locale = resolveEmailLocale(input.locale);
  const amountFormatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: input.currency.toUpperCase(),
  }).format(input.amountDue / 100);

  const { html, text } = await renderEmail(
    <PaymentFailedEmail
      userName={input.userName}
      roomId={input.roomId}
      link={link}
      amountFormatted={amountFormatted}
      locale={locale}
    />,
  );

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "BotMaker <botmarket@codeswift.com.br>";

  const { error } = await resend.emails.send({
    to: input.to,
    from,
    subject: await paymentFailedEmailSubject(input.roomId, locale),
    text,
    html,
  });

  if (error) {
    throw new Error(`Resend failed to send payment-failed alert: ${error.message}`);
  }
}
