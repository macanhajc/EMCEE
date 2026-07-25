import { useTranslations } from "next-intl";
import { SiteFooter } from "@/components/Elements/site-footer";
import { SiteNav } from "@/components/Elements/site-nav";
import type { SystemHealthStatus } from "@/lib/health";

// Same palette as InstanceStatusBadge (components/Elements/instance-status.tsx)
// where the meaning overlaps (green = healthy, red = down). "degraded" here
// is its own middle state — some things are wrong but the data plane itself
// is up — so it gets the brand accent color rather than reusing that
// component's red (there, "degraded" IS the worst state a single instance
// has).
const STATUS_DOT_CLASS: Record<SystemHealthStatus, string> = {
  operational: "bg-emerald-400",
  degraded: "bg-marquee animate-bulb-pulse",
  down: "bg-red-400 animate-bulb-pulse",
};

export function HealthTemplate({ status }: { status: SystemHealthStatus }) {
  const t = useTranslations("health");

  return (
    <div className="flex flex-1 flex-col bg-ink font-marquee-body">
      <SiteNav />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">{t("eyebrow")}</p>
          <h1 className="mt-3 font-display text-3xl text-paper sm:text-4xl">{t("title")}</h1>

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-paper/10 bg-panel/40 p-6">
            <span aria-hidden className={`mt-1.5 size-3 flex-none rounded-full ${STATUS_DOT_CLASS[status]}`} />
            <div>
              <p className="font-display text-lg text-paper">{t(`status.${status}.label`)}</p>
              <p className="mt-1 max-w-xl font-marquee-body text-sm leading-relaxed text-dust">
                {t(`status.${status}.description`)}
              </p>
            </div>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
