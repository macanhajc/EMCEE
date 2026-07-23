import { useTranslations } from "next-intl";

function TickerLine({ items }: { items: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-10 pr-10 font-display text-xs tracking-wide text-ink/80">
      {items.map((item) => (
        <span key={item} className="flex items-center gap-3">
          <span aria-hidden className="size-1.5 rounded-full bg-ink/60" />
          {item}
        </span>
      ))}
    </span>
  );
}

export function MarqueeTicker() {
  const t = useTranslations("home.marqueeTicker");
  const items = t.raw("items") as string[];

  return (
    <div
      className="border-y-4 border-ink bg-marquee py-2.5"
    >
      <div className="flex items-center gap-4 px-4 sm:px-6">
        <span className="flex shrink-0 items-center gap-1.5 border-r-2 border-ink/70 pr-4 font-display text-xs text-ink">
          <span aria-hidden className="size-2 animate-bulb-pulse rounded-full bg-spotlight" />
          {t("live")}
        </span>
        <div className="flex overflow-hidden">
          <div className="flex w-max shrink-0 animate-marquee-scroll">
            <TickerLine items={items} />
            <TickerLine items={items} />
          </div>
        </div>
      </div>
    </div>
  );
}
