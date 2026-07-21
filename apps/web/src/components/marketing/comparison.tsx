const ROWS = [
  {
    alt: "In-game Gold rentals",
    weakness: "ToS-violating, no dashboard, no SLA — you're trusting a stranger.",
    answer: "Real currency billing, self-serve config, a status page that's actually yours.",
  },
  {
    alt: "DIY (Replit + a template)",
    weakness: "Setup pain, config buried in code, downtime nobody's watching.",
    answer: "Two-minute onboarding, forms instead of code — we carry the ops.",
  },
  {
    alt: "Doing nothing",
    weakness: "An unmoderated room. A room that feels dead when you're not there.",
    answer: "Cheap enough to be an obvious yes.",
  },
];

export function Comparison() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
        The technical rider
      </p>
      <h2 className="mt-3 max-w-xl font-display text-3xl leading-tight text-paper sm:text-4xl">
        Everyone else made the room owner do the work.
      </h2>

      <div className="mt-12 divide-y divide-paper/10 border-y border-paper/10">
        {ROWS.map((row) => (
          <div
            key={row.alt}
            className="grid gap-4 py-8 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-8"
          >
            <div>
              <p className="font-display text-base text-paper/60 line-through decoration-paper/30">
                {row.alt}
              </p>
              <p className="mt-2 font-marquee-body text-sm text-dust">{row.weakness}</p>
            </div>

            <span aria-hidden className="hidden font-display text-2xl text-marquee sm:block">
              →
            </span>

            <div>
              <p className="font-display text-base text-spotlight">BotMarket</p>
              <p className="mt-2 font-marquee-body text-sm text-paper/90">{row.answer}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
