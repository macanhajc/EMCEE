"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/UI/button";
import { Link } from "@/i18n/navigation";
import { type CookieConsent, setCookieConsent } from "@/lib/cookie-consent";
import { useCookieConsent } from "@/lib/use-cookie-consent";

/**
 * `initialConsent` comes from RootLayout reading the request cookie server
 * side, so this renders correctly on the very first paint — no flash for
 * visitors who already accepted or rejected. Renders nothing once a choice
 * is made.
 */
export function CookieConsentBanner({ initialConsent }: { initialConsent: CookieConsent }) {
  const t = useTranslations("cookieBanner");
  const consent = useCookieConsent(initialConsent);

  if (consent !== "undecided") return null;

  return (
    <div
      role="region"
      aria-label={t("heading")}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-paper/10 bg-ink/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-marquee-body text-sm text-dust">
          {t("body")}{" "}
          <Link href="/privacy" className="underline hover:text-paper">
            {t("learnMore")}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-paper/25 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
            onClick={() => setCookieConsent("rejected")}
          >
            {t("reject")}
          </Button>
          <Button
            size="sm"
            className="bg-marquee text-ink hover:bg-marquee/85"
            onClick={() => setCookieConsent("accepted")}
          >
            {t("accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
