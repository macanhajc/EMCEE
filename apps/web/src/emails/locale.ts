/**
 * Locale for emails sent outside a page request (cron sweep, Stripe
 * webhook) — there's no next-intl request context to read there, so these
 * fall back to the user's last-seen locale (users.locale, written
 * opportunistically by proxy.ts) and then to the app default.
 */
import "server-only";
import { routing, type AppLocale } from "@/i18n/routing";

export function resolveEmailLocale(stored: string | null | undefined): AppLocale {
  return (routing.locales as readonly string[]).includes(stored ?? "")
    ? (stored as AppLocale)
    : routing.defaultLocale;
}
