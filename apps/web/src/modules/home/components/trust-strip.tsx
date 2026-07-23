import { useTranslations } from "next-intl";
import { Separator } from "@/components/UI/separator";

const ITEM_INDEXES = [0, 1, 2] as const;

export function TrustStrip() {
  const t = useTranslations("home.trustStrip");

  return (
    <section className="border-y border-paper/10 bg-panel-2/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14 sm:flex-row">
        {ITEM_INDEXES.map((i) => (
          <div key={i} className="flex flex-1 gap-6">
            {i > 0 && (
              <Separator orientation="vertical" className="hidden bg-paper/10 sm:block" />
            )}
            <div>
              <p className="font-display text-sm text-marquee">{t(`items.${i}.title`)}</p>
              <p className="mt-2 font-marquee-body text-sm leading-relaxed text-dust">
                {t(`items.${i}.body`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
