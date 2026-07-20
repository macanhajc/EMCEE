/**
 * Magic-link delivery for the Nodemailer auth provider (specs/06-auth.md).
 *
 * No dedicated transactional-email provider is chosen yet (open question —
 * "decide with hosting"). Until EMAIL_SERVER is set, magic links are logged
 * to the server console instead of sent — keeps local dev unblocked without
 * a real SMTP relay. Throws in production if unconfigured: a silent
 * console-only "delivery" in prod would be a broken signup funnel, not a
 * graceful fallback.
 */
import "server-only";
import type { NodemailerConfig } from "next-auth/providers/nodemailer";

export const sendVerificationRequest: NodemailerConfig["sendVerificationRequest"] = async ({
  identifier,
  url,
}) => {
  if (!process.env.EMAIL_SERVER) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("EMAIL_SERVER is not set — cannot send magic links in production");
    }
    console.log(`[dev] magic link for ${identifier}: ${url}`);
    return;
  }

  const { createTransport } = await import("nodemailer");
  const transport = createTransport(process.env.EMAIL_SERVER);
  const from = process.env.EMAIL_FROM ?? "BotMarket <noreply@botmarket.app>";

  await transport.sendMail({
    to: identifier,
    from,
    subject: "Sign in to BotMarket",
    text: `Sign in to BotMarket:\n${url}\n\nThis link expires in 15 minutes and works once.`,
    html: `<p><a href="${url}">Sign in to BotMarket</a></p><p>This link expires in 15 minutes and works once.</p>`,
  });
};
