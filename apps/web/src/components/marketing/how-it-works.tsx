const STEPS = [
  {
    number: "01",
    title: "Sign up",
    body: "Google or a magic link. Quick 18+ attestation before checkout.",
  },
  {
    number: "02",
    title: "Meet Emcee",
    body: "One bot. It ships with Emotes, Concierge, Warden, and Avatar — Music is on the way.",
  },
  {
    number: "03",
    title: "Paste your token",
    body: "Your bot token and room ID. We guide you to both, and to granting designer rights.",
  },
  {
    number: "04",
    title: "Go live",
    body: "The bot connects, the dashboard shows live. Tweak config — changes apply in seconds.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-paper/10 bg-panel/40">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
          Backstage pass
        </p>
        <h2 className="mt-3 font-display text-3xl leading-tight text-paper sm:text-4xl">
          Two minutes, four steps.
        </h2>

        <div className="mt-12 grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div
              key={step.number}
              className={`px-6 py-6 first:pl-0 sm:border-paper/15 lg:py-0 ${
                i > 0 ? "border-t border-dashed sm:border-t-0 sm:border-l" : ""
              }`}
            >
              <p className="font-display text-4xl text-marquee">{step.number}</p>
              <h3 className="mt-3 font-display text-lg text-paper">{step.title}</h3>
              <p className="mt-2 font-marquee-body text-sm leading-relaxed text-dust">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
