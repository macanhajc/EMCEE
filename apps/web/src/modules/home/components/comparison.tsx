import { useTranslations } from "next-intl";

const ROW_KEYS = [0, 1, 2] as const;

export function Comparison() {
  const t = useTranslations("home.comparison");

  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
        {t("eyebrow")}
      </p>
      <h2 className="mt-3 max-w-xl font-display text-3xl leading-tight text-paper sm:text-4xl">
        {t("title")}
      </h2>

      <div className="mt-12 divide-y divide-paper/10 border-y border-paper/10">
        {ROW_KEYS.map((i) => (
          <div
            key={i}
            className="grid gap-4 py-8 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-8"
          >
            <div>
              <p className="font-display text-base text-paper/60 line-through decoration-paper/30">
                {t(`rows.${i}.alt`)}
              </p>
              <p className="mt-2 font-marquee-body text-sm text-dust">{t(`rows.${i}.weakness`)}</p>
            </div>

            <span aria-hidden className="hidden font-display text-2xl text-marquee sm:block">
              →
            </span>

            <div>
              <p className="font-display text-base text-spotlight">BotMaker</p>
              <p className="mt-2 font-marquee-body text-sm text-paper/90">
                {t(`rows.${i}.answer`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
