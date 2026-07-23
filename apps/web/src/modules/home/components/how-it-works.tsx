import { useTranslations } from "next-intl";

const STEP_INDEXES = [0, 1, 2, 3] as const;

export function HowItWorks() {
  const t = useTranslations("home.howItWorks");

  return (
    <section id="how-it-works" className="border-y border-paper/10 bg-panel/40">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
          {t("eyebrow")}
        </p>
        <h2 className="mt-3 font-display text-3xl leading-tight text-paper sm:text-4xl">
          {t("title")}
        </h2>

        <div className="mt-12 grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
          {STEP_INDEXES.map((i) => (
            <div
              key={i}
              className={`px-6 py-6 first:pl-0 sm:border-paper/15 lg:py-0 ${
                i > 0 ? "border-t border-dashed sm:border-t-0 sm:border-l" : ""
              }`}
            >
              <p className="font-display text-4xl text-marquee">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 font-display text-lg text-paper">
                {t(`steps.${i}.title`)}
              </h3>
              <p className="mt-2 font-marquee-body text-sm leading-relaxed text-dust">
                {t(`steps.${i}.body`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
