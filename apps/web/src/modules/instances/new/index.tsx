import { Link2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/Elements/dashboard-shell";
import { Alert, AlertDescription } from "@/components/UI/alert";
import { Badge } from "@/components/UI/badge";
import { Button } from "@/components/UI/button";
import { Input } from "@/components/UI/input";
import { Label } from "@/components/UI/label";
import { BOT_FEATURES, BOT_ROADMAP } from "@/lib/roadmap";
import type { catalogBots } from "@/db/schema";

type CatalogBot = typeof catalogBots.$inferSelect;

export function NewInstanceTemplate({
  email,
  role,
  hasBilling,
  error,
  bot,
  createInstance,
}: {
  email: string;
  role: "customer" | "admin";
  hasBilling: boolean;
  error?: string;
  bot: CatalogBot | null;
  createInstance: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("instancesNew");
  const tBot = useTranslations("bot");

  return (
    <DashboardShell email={email} role={role} hasBilling={hasBilling}>
      <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">{t("eyebrow")}</p>
      <h1 className="mt-2 font-display text-3xl text-paper">{t("title")}</h1>
      <p className="mt-3 max-w-lg font-marquee-body text-sm leading-relaxed text-dust">
        {t("subtitle")}
      </p>

      {error && (
        <Alert className="mt-6 max-w-lg border-red-500/30 bg-red-500/10">
          <AlertDescription className="text-red-300">
            {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}
          </AlertDescription>
        </Alert>
      )}

      {!bot ? (
        <div className="mt-10 rounded-2xl border border-dashed border-paper/20 px-8 py-16 text-center">
          <p className="font-display text-xl text-paper">{t("empty.title")}</p>
          <p className="mx-auto mt-2 max-w-sm font-marquee-body text-sm text-dust">
            {t("empty.body")}
          </p>
        </div>
      ) : (
        <form action={createInstance} className="mt-8 grid max-w-6xl gap-8">
          <input type="hidden" name="bot" value={bot.slug} />

          <div className="rounded-2xl border border-paper/10 bg-panel p-7">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl text-paper">{bot.name}</h2>
              {bot.lifecycle !== "ga" && (
                <Badge className="rounded-full border-0 bg-marquee text-ink hover:bg-marquee">
                  {t.has(`lifecycle.${bot.lifecycle}`) ? t(`lifecycle.${bot.lifecycle}`) : bot.lifecycle}
                </Badge>
              )}
            </div>
            {bot.tagline && <p className="mt-3 text-base text-dust">{bot.tagline}</p>}
            <div className="mt-5 grid gap-3 border-t border-paper/10 pt-5 sm:grid-cols-2">
              {BOT_FEATURES.map((feature) => (
                <div key={feature.key} className="border p-6 border-paper/10 bg-paper/5 rounded-2xl">
                  <p className="font-display text-base text-spotlight">
                    {tBot(`features.${feature.key}.name`)}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-dust">
                    {tBot(`features.${feature.key}.body`)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
              {t("comingSoonLabel")}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {BOT_ROADMAP.map((mod) => (
                <div
                  key={mod.key}
                  className="rounded-xl border border-dashed border-paper/15 bg-transparent p-3"
                >
                  <h3 className="font-display text-sm text-paper/70">
                    {tBot(`roadmap.${mod.key}.name`)}
                  </h3>
                  <p className="font-ui-mono text-[10px] text-dust">
                    {tBot(`roadmap.${mod.key}.role`)}
                  </p>
                  <p className="mt-1 text-xs text-dust">{tBot(`roadmap.${mod.key}.body`)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid">
            <Label htmlFor="room_id" className="text-dust mb-2">
              {t("roomLabel")}
            </Label>
            <Input
              id="room_id"
              name="room_id"
              required
              placeholder={t("roomPlaceholder")}
              className="h-11 border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30"
            />
            <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-dust">
              <Link2 aria-hidden className="mt-0.5 size-3.5 shrink-0 text-marquee" />
              {t("roomHint")}
            </p>
          </div>

          <div className="rounded-2xl border border-paper/10 bg-panel p-5">
            <Label htmlFor="token" className="text-dust mb-2">
              {t("tokenLabel")}
            </Label>
            <Input
              id="token"
              name="token"
              type="password"
              autoComplete="off"
              required
              className="mt-1.5 h-11 border-paper/15 bg-ink/50 text-paper placeholder:text-dust/50 focus-visible:border-spotlight/50 focus-visible:ring-spotlight/30"
            />
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-dust">
              <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-marquee" />
              {t("tokenHint")}
            </p>
            <details className="mt-4 group/details">
              <summary className="cursor-pointer font-ui-mono text-[11px] tracking-[0.1em] text-marquee uppercase select-none">
                {t("tokenHelp.summary")}
              </summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-dust">
                <li>{t("tokenHelp.step1")}</li>
                <li>{t("tokenHelp.step2")}</li>
                <li>{t("tokenHelp.step3")}</li>
              </ol>
            </details>
          </div>

          <Button type="submit" className="h-11 w-full bg-marquee text-ink hover:bg-marquee/85">
            {t("submit")}
          </Button>
        </form>
      )}
    </DashboardShell>
  );
}
