import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/UI/button";
import type { EmceePrices } from "@/lib/pricing";

function TicketNotch() {
  return (
    <div className="relative border-t border-dashed border-paper/25">
      <span
        aria-hidden
        className="absolute -top-2.5 -left-8 size-5 rounded-full bg-ink"
      />
      <span
        aria-hidden
        className="absolute -top-2.5 -right-8 size-5 rounded-full bg-ink"
      />
    </div>
  );
}

export function Pricing({ prices }: { prices: EmceePrices }) {
  const t = useTranslations("home.pricing");
  const locale = useLocale();
  const isPt = locale === "pt";

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-24">
      <div className="max-w-xl">
        <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
          {t("eyebrow")}
        </p>
        <h2 className="mt-3 font-display text-3xl leading-tight text-paper sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-4 font-marquee-body text-dust">{t("subtitle")}</p>
      </div>

      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-paper/10 bg-panel">
          <div className="p-8">
            <p className="font-display text-sm text-dust">{t("monthly.label")}</p>
            <p className="mt-3 font-display text-4xl text-paper">
              {isPt ? prices.monthly.brl : prices.monthly.usd}
              <span className="font-ui-mono text-base text-dust">{t("monthly.period")}</span>
            </p>
            {isPt && (
              <p className="mt-1 font-ui-mono text-xs text-dust">
                {t("monthly.reference", { usd: prices.monthly.usd })}
              </p>
            )}
          </div>
          <div className="px-8 pb-8">
            <TicketNotch />
            <ul className="mt-6 space-y-2 font-marquee-body text-sm text-dust">
              <li>{t("monthly.features.0")}</li>
              <li>{t("monthly.features.1")}</li>
              <li>{t("monthly.features.2")}</li>
            </ul>
            <Button
              asChild
              className="mt-6 w-full bg-transparent border border-paper/25 text-paper hover:bg-paper/10 hover:text-paper"
              variant="outline"
            >
              <Link href="/dashboard">{t("monthly.cta")}</Link>
            </Button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-marquee/40 bg-panel">
          <span className="absolute top-6 right-6 rounded-full bg-spotlight px-3 py-1 font-ui-mono text-[11px] text-ink">
            {t("annual.badge")}
          </span>
          <div className="p-8">
            <p className="font-display text-sm text-dust">{t("annual.label")}</p>
            <p className="mt-3 font-display text-4xl text-paper">
              {isPt ? prices.annual.brl : prices.annual.usd}
              <span className="font-ui-mono text-base text-dust">{t("annual.period")}</span>
            </p>
            {isPt && (
              <p className="mt-1 font-ui-mono text-xs text-dust">
                {t("annual.reference", { usd: prices.annual.usd })}
              </p>
            )}
          </div>
          <div className="px-8 pb-8">
            <TicketNotch />
            <ul className="mt-6 space-y-2 font-marquee-body text-sm text-dust">
              <li>{t("annual.features.0")}</li>
              <li>{t("annual.features.1")}</li>
              <li>{t("annual.features.2")}</li>
            </ul>
            <Button
              asChild
              className="mt-6 w-full bg-marquee text-ink hover:bg-marquee/85"
            >
              <Link href="/dashboard">{t("annual.cta")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
