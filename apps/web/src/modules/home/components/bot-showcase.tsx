import { useTranslations } from "next-intl";
import { Badge } from "@/components/UI/badge";
import { BOT_FEATURES, BOT_ROADMAP } from "@/lib/roadmap";

export function BotShowcase() {
  const t = useTranslations("home.botShowcase");
  const tBot = useTranslations("bot");

  return (
    <section id="the-act" className="mx-auto max-w-6xl px-6 py-24">
      <div className="max-w-2xl">
        <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
          {t("eyebrow")}
        </p>
        <h2 className="mt-3 font-display text-3xl leading-tight text-paper sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-4 font-marquee-body text-dust">{t("subtitle")}</p>
      </div>

      <div className="mt-12 rounded-2xl border border-paper/10 bg-panel p-8">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-2xl text-paper">Emcee</h3>
          <Badge className="rounded-full border-0 bg-marquee text-ink hover:bg-marquee">
            {t("badge")}
          </Badge>
        </div>
        <p className="mt-2 font-marquee-body text-sm text-dust">{t("tagline")}</p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BOT_FEATURES.map((feature) => (
            <div key={feature.key} className="border p-6 rounded-2xl border-paper/10 bg-paper/5">
              <p className="font-display text-base text-spotlight">
                {tBot(`features.${feature.key}.name`)}
              </p>
              <p className="mt-2 font-marquee-body text-sm leading-relaxed text-dust">
                {tBot(`features.${feature.key}.body`)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
          {t("comingSoonLabel")}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BOT_ROADMAP.map((mod) => (
            <div
              key={mod.key}
              className="rounded-2xl border border-dashed border-paper/15 bg-transparent p-6"
            >
              <div className="flex items-center gap-2">
                <h4 className="font-display text-lg text-paper/70">
                  {tBot(`roadmap.${mod.key}.name`)}
                </h4>
              </div>
              <p className="font-ui-mono text-[11px] text-dust">
                {tBot(`roadmap.${mod.key}.role`)}
              </p>
              <p className="mt-2 font-marquee-body text-sm text-dust">
                {tBot(`roadmap.${mod.key}.body`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
