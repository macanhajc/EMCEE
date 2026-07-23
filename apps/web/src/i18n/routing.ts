import { defineRouting } from "next-intl/routing";

// Keep in sync with the message files in /messages and with proxy.ts's
// locale-prefix handling (which relies on this list to recognize a
// URL segment as a locale rather than a route).
export const routing = defineRouting({
  locales: ["en", "es", "de", "pt", "ru"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
