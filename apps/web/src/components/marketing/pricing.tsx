import Link from "next/link";

import { Button } from "@/components/ui/button";

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

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-24">
      <div className="max-w-xl">
        <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
          Admission
        </p>
        <h2 className="mt-3 font-display text-3xl leading-tight text-paper sm:text-4xl">
          One price. One bot. One room.
        </h2>
        <p className="mt-4 font-marquee-body text-dust">
          Per instance — one catalog bot, connected to one room. 7-day trial,
          card or Pix required to start.
        </p>
      </div>

      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-paper/10 bg-panel">
          <div className="p-8">
            <p className="font-display text-sm text-dust">Monthly</p>
            <p className="mt-3 font-display text-4xl text-paper">
              R$39<span className="font-ui-mono text-base text-dust">/mo</span>
            </p>
            <p className="mt-1 font-ui-mono text-xs text-dust">~US$7 reference</p>
          </div>
          <div className="px-8 pb-8">
            <TicketNotch />
            <ul className="mt-6 space-y-2 font-marquee-body text-sm text-dust">
              <li>Billed monthly, cancel anytime</li>
              <li>7-day trial before the first charge</li>
              <li>Live dashboard, hot-apply config</li>
            </ul>
            <Button
              asChild
              className="mt-6 w-full bg-transparent border border-paper/25 text-paper hover:bg-paper/10 hover:text-paper"
              variant="outline"
            >
              <Link href="/dashboard">Start free trial</Link>
            </Button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-marquee/40 bg-panel">
          <span className="absolute top-6 right-6 rounded-full bg-spotlight px-3 py-1 font-ui-mono text-[11px] text-ink">
            2 months free
          </span>
          <div className="p-8">
            <p className="font-display text-sm text-dust">Annual</p>
            <p className="mt-3 font-display text-4xl text-paper">
              R$390<span className="font-ui-mono text-base text-dust">/yr</span>
            </p>
            <p className="mt-1 font-ui-mono text-xs text-dust">~US$70 reference</p>
          </div>
          <div className="px-8 pb-8">
            <TicketNotch />
            <ul className="mt-6 space-y-2 font-marquee-body text-sm text-dust">
              <li>10× monthly — two months free</li>
              <li>7-day trial before the first charge</li>
              <li>Live dashboard, hot-apply config</li>
            </ul>
            <Button
              asChild
              className="mt-6 w-full bg-marquee text-ink hover:bg-marquee/85"
            >
              <Link href="/dashboard">Start free trial</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
