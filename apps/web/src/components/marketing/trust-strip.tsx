import { Separator } from "@/components/ui/separator";

const ITEMS = [
  {
    title: "BYOT",
    body: "Your Highrise account, your bot token. We host and configure — we never own the account.",
  },
  {
    title: "Zero Gold, ever",
    body: "Every price on this page is real currency. We never accept, hold, or transfer Highrise Gold.",
  },
  {
    title: "Official SDK only",
    body: "First-party catalog code on Pocket Worlds' own highrise-bot-sdk — you configure, you never upload code.",
  },
];

export function TrustStrip() {
  return (
    <section className="border-y border-paper/10 bg-panel-2/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14 sm:flex-row">
        {ITEMS.map((item, i) => (
          <div key={item.title} className="flex flex-1 gap-6">
            {i > 0 && (
              <Separator orientation="vertical" className="hidden bg-paper/10 sm:block" />
            )}
            <div>
              <p className="font-display text-sm text-marquee">{item.title}</p>
              <p className="mt-2 font-marquee-body text-sm leading-relaxed text-dust">
                {item.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
