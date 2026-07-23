/**
 * Magic-link delivery for the Nodemailer auth provider (specs/06-auth.md).
 * The provider itself is unused for transport — `sendVerificationRequest`
 * is fully overridden here to send through Resend instead.
 *
 * Decided 2026-07-20 (docs/decisions.md): Resend, resolving the "dedicated
 * transactional email provider" open question. Until RESEND_API_KEY is set,
 * magic links are logged to the server console instead of sent — keeps
 * local dev unblocked without a real account. Throws in production if
 * unconfigured: a silent console-only "delivery" in prod would be a broken
 * signup funnel, not a graceful fallback.
 *
 * Locale: read via getLocale() rather than threaded through Auth.js's
 * signIn() options. This runs inside the same request as the server action
 * that called signIn("nodemailer", ...) (login/actions.ts), so next-intl's
 * request-scoped locale is already available here — and unlike a DB lookup,
 * it works even for a brand-new user who has no `users` row yet at send time.
 */
import "server-only";
import type { NodemailerConfig } from "next-auth/providers/nodemailer";
import { getLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { renderEmail } from "@/emails/render";
import { SignInEmail, signInEmailSubject } from "@/emails/templates/sign-in";

export const sendVerificationRequest: NodemailerConfig["sendVerificationRequest"] = async ({
  identifier,
  url,
}) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set — cannot send magic links in production");
    }
    console.log(`[dev] magic link for ${identifier}: ${url}`);
    return;
  }

  const locale = (await getLocale()) as AppLocale;
  const { html, text } = await renderEmail(<SignInEmail url={url} locale={locale} />);

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "BotMarket <noreply@botmarket.app>";

  const { error } = await resend.emails.send({
    to: identifier,
    from,
    subject: await signInEmailSubject(locale),
    text,
    html,
  });

  if (error) {
    throw new Error(`Resend failed to send magic link: ${error.message}`);
  }
};
