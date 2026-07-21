const TICKER_ITEMS = [
  "EMCEE ONLINE — HOSTING ROOMS RIGHT NOW",
  "SAY THE EMOTE, THEY DO THE EMOTE — EVEN ONES YOU DON'T OWN",
  'OWNER CALLS "ALL <EMOTE>" — THE WHOLE ROOM MOVES AT ONCE',
  "BRING YOUR OWN BOT TOKEN — YOUR ACCOUNT, ALWAYS",
  "REAL CURRENCY ONLY — ZERO GOLD ACCEPTED, EVER",
  "BUILT ON THE OFFICIAL HIGHRISE BOT SDK",
];

function TickerLine() {
  return (
    <span className="flex shrink-0 items-center gap-10 pr-10 font-display text-xs tracking-wide text-ink/80">
      {TICKER_ITEMS.map((item) => (
        <span key={item} className="flex items-center gap-3">
          <span aria-hidden className="size-1.5 rounded-full bg-ink/60" />
          {item}
        </span>
      ))}
    </span>
  );
}

export function MarqueeTicker() {
  return (
    <div
      className="border-y-4 border-ink bg-marquee py-2.5"
    >
      <div className="flex items-center gap-4 px-4 sm:px-6">
        <span className="flex shrink-0 items-center gap-1.5 border-r-2 border-ink/70 pr-4 font-display text-xs text-ink">
          <span aria-hidden className="size-2 animate-bulb-pulse rounded-full bg-spotlight" />
          LIVE
        </span>
        <div className="flex overflow-hidden">
          <div className="flex w-max shrink-0 animate-marquee-scroll">
            <TickerLine />
            <TickerLine />
          </div>
        </div>
      </div>
    </div>
  );
}
