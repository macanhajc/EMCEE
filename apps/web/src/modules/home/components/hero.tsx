import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/UI/button";

function DemoTranscript() {
  const t = useTranslations("home.hero");
  const lines = [
    { speaker: t("demoSpeakerGuest"), text: t("demoLine1Text"), result: t("demoLine1Result") },
    { speaker: t("demoSpeakerOwner"), text: t("demoLine2Text"), result: t("demoLine2Result") },
  ];

  return (
    <div className="space-y-2.5 font-ui-mono text-[13px] leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex gap-2">
            <span className="shrink-0 text-dust">{line.speaker}</span>
            <span className="text-paper/80">{line.text}</span>
          </div>
          <div className="flex gap-2">
            <span className="shrink-0 text-marquee">{t("demoSpeakerBot")}</span>
            <span className="text-paper">{line.result}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Hero() {
  const t = useTranslations("home.hero");

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 15% 0%, color-mix(in oklch, var(--spotlight), transparent 82%), transparent 55%), radial-gradient(circle at 85% 15%, color-mix(in oklch, var(--marquee), transparent 85%), transparent 55%)",
        }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-6 py-20 sm:py-28 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div>
          <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
            {t("eyebrow")}
          </p>

          <h1 className="mt-5 font-display text-[2.6rem] leading-[1.08] text-paper sm:text-6xl sm:leading-[1.05]">
            {t("titleLine1")}
            <br />
            {t("titleLine2")}
            <br />
            <span className="text-spotlight">{t("titleLine3")}</span>
          </h1>

          <p className="mt-6 max-w-md font-marquee-body text-lg leading-relaxed text-dust">
            {t("subtitle")}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="h-12 bg-marquee px-6 text-base text-ink hover:bg-marquee/85"
            >
              <Link href="/dashboard">{t("ctaPrimary")}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-paper/25 bg-transparent px-6 text-base text-paper hover:bg-paper/10 hover:text-paper"
            >
              <a href="#the-act">{t("ctaSecondary")}</a>
            </Button>
          </div>

          <p className="mt-4 font-ui-mono text-xs text-dust">{t("note")}</p>
        </div>

        <div className="relative">
          <div className="rounded-2xl border border-paper/10 bg-panel p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_30px_60px_-20px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between border-b border-paper/10 pb-4">
              <span className="font-display text-xs tracking-wide text-dust">
                {t("demoLabel")}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-spotlight/15 px-2.5 py-1 font-ui-mono text-[11px] text-spotlight">
                <span aria-hidden className="size-1.5 animate-bulb-pulse rounded-full bg-spotlight" />
                {t("live")}
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="font-display text-xl text-paper">Emcee</p>
                <p className="font-marquee-body text-sm text-dust">{t("demoBotTagline")}</p>
              </div>
              <p className="font-ui-mono text-xs text-dust">{t("demoUptime")}</p>
            </div>

            <div className="mt-6 rounded-lg bg-ink/60 p-4">
              <DemoTranscript />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
