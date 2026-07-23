import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DashboardShell } from "@/components/Elements/dashboard-shell";
import { QueryToast } from "@/components/Elements/query-toast";
import { Button } from "@/components/UI/button";
import type { botInstances, subscriptions } from "@/db/schema";
import { InstanceCard } from "./components/instance-card";

type Instance = typeof botInstances.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;

export function DashboardTemplate({
  email,
  role,
  hasBilling,
  deletedMessage,
  instances,
  botNames,
  subscriptions: instanceSubscriptions,
}: {
  email: string;
  role: "customer" | "admin";
  hasBilling: boolean;
  deletedMessage?: boolean;
  instances: Instance[];
  botNames: Map<string, string>;
  subscriptions: Map<string, Subscription>;
}) {
  const t = useTranslations("dashboard");

  return (
    <DashboardShell email={email} role={role} hasBilling={hasBilling}>
      <QueryToast success={deletedMessage ? t("deletedMessage") : undefined} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl text-paper">{t("title")}</h1>
        </div>
        {instances.length > 0 && (
          <Button asChild className="bg-marquee text-ink hover:bg-marquee/85">
            <Link href="/instances/new">{t("newInstance")}</Link>
          </Button>
        )}
      </div>

      {instances.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-paper/20 px-8 py-16 text-center">
          <p className="font-display text-xl text-paper">{t("empty.title")}</p>
          <p className="mx-auto mt-2 max-w-sm font-marquee-body text-sm text-dust">
            {t("empty.body")}
          </p>
          <Button asChild className="mt-6 bg-marquee text-ink hover:bg-marquee/85">
            <Link href="/instances/new">{t("empty.cta")}</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              botName={botNames.get(instance.catalogBotSlug) ?? instance.catalogBotSlug}
              subscription={instanceSubscriptions.get(instance.id) ?? null}
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
