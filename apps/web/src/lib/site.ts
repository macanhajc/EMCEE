import { routing } from "@/i18n/routing";

// Production fallback if APP_ORIGIN is ever unset in a deployed environment
// (dev/.env.example always sets it to localhost) — keeps metadataBase/
// canonical/sitemap URLs from silently pointing at localhost in prod.
export const SITE_URL = process.env.APP_ORIGIN ?? "https://botmaker.codeswift.com.br";

export const SITE_NAME = "BotMaker";

/**
 * hreflang alternates for a locale-agnostic pathname (e.g. "/", "/privacy"),
 * plus x-default — required because localePrefix "always" means every
 * locale (including the default) serves the same content at a distinct URL,
 * which search engines would otherwise treat as near-duplicate pages.
 */
export function hreflangAlternates(pathname: string): Record<string, string> {
  const suffix = pathname === "/" ? "" : pathname;
  const languages = Object.fromEntries(
    routing.locales.map((locale) => [locale, `${SITE_URL}/${locale}${suffix}`]),
  );
  return { ...languages, "x-default": languages[routing.defaultLocale] };
}
