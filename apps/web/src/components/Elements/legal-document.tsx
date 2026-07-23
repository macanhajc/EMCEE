import { useTranslations } from "next-intl";

export type LegalSection = {
  key: string;
  variant?: "list";
};

export function LegalDocument({
  namespace,
  sections,
}: {
  namespace: "privacy" | "terms";
  sections: readonly LegalSection[];
}) {
  const t = useTranslations(namespace);
  const intro = t.raw("intro") as string[];

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
        {t("eyebrow")}
      </p>
      <h1 className="mt-3 font-display text-3xl text-paper sm:text-4xl">{t("title")}</h1>
      <p className="mt-2 font-ui-mono text-xs text-dust">{t("updated")}</p>

      <div className="mt-8 space-y-4 font-marquee-body text-sm leading-relaxed text-dust">
        {intro.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      <nav
        aria-label={t("onThisPage")}
        className="mt-8 rounded-2xl border border-paper/10 bg-panel/40 p-6"
      >
        <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
          {t("onThisPage")}
        </p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {sections.map(({ key }) => (
            <li key={key}>
              <a
                href={`#${key}`}
                className="font-marquee-body text-sm text-dust transition-colors hover:text-paper"
              >
                {t(`sections.${key}.heading`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-4 divide-y divide-paper/10 border-t border-paper/10">
        {sections.map(({ key, variant }) => {
          const body = t.raw(`sections.${key}.body`) as string[];
          return (
            <section key={key} id={key} className="scroll-mt-24 py-8">
              <h2 className="font-display text-xl text-paper">
                {t(`sections.${key}.heading`)}
              </h2>
              {variant === "list" ? (
                <ul className="mt-4 list-disc space-y-2 pl-5 font-marquee-body text-sm leading-relaxed text-dust">
                  {body.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 space-y-4 font-marquee-body text-sm leading-relaxed text-dust">
                  {body.map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
}
