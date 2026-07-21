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
 */
import "server-only";
import type { NodemailerConfig } from "next-auth/providers/nodemailer";

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

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "BotMarket <noreply@botmarket.app>";

  const { error } = await resend.emails.send({
    to: identifier,
    from,
    subject: "Sign in to BotMarket",
    text: `Sign in to BotMarket:\n${url}\n\nThis link expires in 15 minutes and works once.`,
    html: `<p><a href="${url}">Sign in to BotMarket</a></p><p>This link expires in 15 minutes and works once.</p>`,
  });

  if (error) {
    throw new Error(`Resend failed to send magic link: ${error.message}`);
  }
};
