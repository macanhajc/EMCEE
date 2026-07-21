import { Badge } from "@/components/ui/badge";
import { BOT_FEATURES, BOT_ROADMAP } from "@/lib/roadmap";

export function BotShowcase() {
  return (
    <section id="the-act" className="mx-auto max-w-6xl px-6 py-24">
      <div className="max-w-2xl">
        <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
          The bot
        </p>
        <h2 className="mt-3 font-display text-3xl leading-tight text-paper sm:text-4xl">
          Meet Emcee. It grows with you.
        </h2>
        <p className="mt-4 font-marquee-body text-dust">
          One bot, one subscription, one token — it doesn&apos;t get swapped
          out as new modules ship. Your room&apos;s full-time host: it
          entertains, greets, moderates, and looks the part.
        </p>
      </div>

      <div className="mt-12 rounded-2xl border border-paper/10 bg-panel p-8">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-2xl text-paper">Emcee</h3>
          <Badge className="rounded-full border-0 bg-marquee text-ink hover:bg-marquee">
            4 modules — live now
          </Badge>
        </div>
        <p className="mt-2 font-marquee-body text-sm text-dust">
          First-party code · configured, never coded
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BOT_FEATURES.map((feature) => (
            <div key={feature.name}>
              <p className="font-display text-sm text-spotlight">{feature.name}</p>
              <p className="mt-2 font-marquee-body text-sm leading-relaxed text-dust">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
          Booking soon — same bot, new modules
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BOT_ROADMAP.map((mod) => (
            <div
              key={mod.name}
              className="rounded-2xl border border-dashed border-paper/15 bg-transparent p-6"
            >
              <div className="flex items-center gap-2">
                <h4 className="font-display text-lg text-paper/70">{mod.name}</h4>
              </div>
              <p className="font-ui-mono text-[11px] text-dust">{mod.role}</p>
              <p className="mt-2 font-marquee-body text-sm text-dust">{mod.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
