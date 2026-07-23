/**
 * Translator for email copy, independent of next-intl's request scope
 * (`getTranslations` needs one; this doesn't) — mailer.ts calls this from
 * a real request via login/actions.ts, but instance-alert-mailer.ts and
 * the payment-failed mailer run from a cron sweep / Stripe webhook, which
 * have no request at all.
 */
import "server-only";
import { createTranslator } from "next-intl";
import type { AppLocale } from "@/i18n/routing";

export async function getEmailTranslator(locale: AppLocale) {
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return createTranslator({ locale, messages, namespace: "emails" });
}
