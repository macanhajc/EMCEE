"use client";

import { useEffect } from "react";
import { ArrowLeft, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { DashboardShell } from "@/components/Elements/dashboard-shell";
import {
  InstanceStatusBadge,
  SubscriptionBadge,
} from "@/components/Elements/instance-status";
import { QueryToast } from "@/components/Elements/query-toast";
import { Button } from "@/components/UI/button";
import type { botInstances, catalogBots, subscriptions } from "@/db/schema";
import type { RoomInfo } from "@/lib/highrise-webapi";
import { useInstanceHeader } from "./hooks/use-instance-header";
import { InstanceConfig } from "./components/instance-config";
import { NotificationsCard } from "./components/notifications-card";
import { RoomInfoCard } from "./components/room-info-card";
import { InstanceStoreProvider, useInstanceStoreImperative } from "./store";

type Instance = typeof botInstances.$inferSelect;
type CatalogBot = typeof catalogBots.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;

/**
 * Wraps the page body in `InstanceStoreProvider`, seeded from `page.tsx`'s
 * existing server-side fetch (docs/decisions.md, 2026-07-24, "instance
 * store") — `InstanceDetailBody` (below) is a separate component so it can
 * consume that same store via context; a component can't both provide a
 * context and read it itself.
 */
export function InstanceDetailTemplate({
  email,
  role,
  hasBilling,
  instance,
  bot,
  subscription,
  successMessage,
  errorMessage,
  roomInfo,
  emailAlertsEnabled,
  browserAlertsEnabled,
  openBillingPortal,
}: {
  email: string;
  role: "customer" | "admin";
  hasBilling: boolean;
  instance: Instance;
  bot: CatalogBot | undefined;
  subscription: Subscription | null;
  successMessage?: string;
  errorMessage?: string;
  roomInfo: RoomInfo | null;
  emailAlertsEnabled: boolean;
  browserAlertsEnabled: boolean;
  openBillingPortal: () => Promise<void>;
}) {
  return (
    <InstanceStoreProvider
      seed={{
        instanceId: instance.id,
        header: { instance, bot, subscription },
        notifications: { emailAlertsEnabled, browserAlertsEnabled },
        roomInfo,
      }}
    >
      <InstanceDetailBody
        email={email}
        role={role}
        hasBilling={hasBilling}
        instanceId={instance.id}
        successMessage={successMessage}
        errorMessage={errorMessage}
        openBillingPortal={openBillingPortal}
      />
    </InstanceStoreProvider>
  );
}

function InstanceDetailBody({
  email,
  role,
  hasBilling,
  instanceId,
  successMessage,
  errorMessage,
  openBillingPortal,
}: {
  email: string;
  role: "customer" | "admin";
  hasBilling: boolean;
  instanceId: string;
  successMessage?: string;
  errorMessage?: string;
  openBillingPortal: () => Promise<void>;
}) {
  const t = useTranslations("instanceDetail");
  const storeApi = useInstanceStoreImperative();

  // The one eager load of every tab card's data (docs/decisions.md,
  // 2026-07-24, "instance store") — client-only, the tab-card data was never
  // server-rendered either before or after this change. Header/notifications/
  // room info don't need loading here — they're already in the store's
  // initial state, seeded by InstanceStoreProvider above.
  useEffect(() => {
    storeApi.getState().loadAll(instanceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  const { header, state: botRunningState, formAction: setBotRunningAction } = useInstanceHeader(instanceId);
  const { instance, bot, subscription } = header;

  useEffect(() => {
    if (!botRunningState) return;
    if (!botRunningState.ok) {
      toast.error(t.has(`errors.${botRunningState.error}`) ? t(`errors.${botRunningState.error}`) : botRunningState.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botRunningState]);

  return (
    <DashboardShell email={email} role={role} hasBilling={hasBilling}>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 font-ui-mono text-xs text-dust hover:text-paper"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        {t("allBots")}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl text-paper">
          {bot?.name ?? instance.catalogBotSlug}
        </h1>
        <InstanceStatusBadge status={instance.status} errorKind={instance.errorKind} />
      </div>

      {bot?.tagline && <p className="mt-2 max-w-lg text-sm text-dust">{bot.tagline}</p>}

      <QueryToast success={successMessage} error={errorMessage} />

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-paper/10 bg-panel p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">{t("room")}</p>
          <p className="mt-1 font-ui-mono text-sm text-paper">{instance.roomId}</p>
        </div>
        <div className="h-px w-full bg-paper/10 sm:h-8 sm:w-px" />
        <div>
          <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
            {t("subscription")}
          </p>
          <div className="mt-1">
            {subscription ? (
              <SubscriptionBadge status={subscription.status} />
            ) : (
              <span className="font-ui-mono text-xs text-dust">{t("notSubscribed")}</span>
            )}
          </div>
        </div>

        {subscription && (
          <>
            <div className="h-px w-full bg-paper/10 sm:h-8 sm:w-px" />
            <div>
              <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">{t("bot")}</p>
              <div className="mt-1.5">
                <form action={setBotRunningAction}>
                  <Button
                    type="submit"
                    size="sm"
                    className={
                      instance.userEnabled
                        ? "border-paper/15 bg-transparent text-paper hover:bg-paper/10 hover:text-paper"
                        : "bg-marquee text-ink hover:bg-marquee/85"
                    }
                    variant={instance.userEnabled ? "outline" : "default"}
                  >
                    {instance.userEnabled ? (
                      <>
                        <Square aria-hidden className="size-3.5" />
                        {t("stopBot")}
                      </>
                    ) : (
                      <>
                        <Play aria-hidden className="size-3.5" />
                        {t("startBot")}
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </div>
          </>
        )}

        {subscription ? (
          <form action={openBillingPortal}>
            <Button
              type="submit"
              variant="outline"
              className="border-paper/15 bg-transparent cursor-pointer text-paper hover:bg-paper/10 hover:text-paper"
            >
              {t("manageBilling")}
            </Button>
          </form>
        ) : (
          <Button asChild className="bg-marquee text-ink hover:bg-marquee/85">
            <Link href={`/checkout?instance=${instance.id}`}>{t("subscribeToActivate")}</Link>
          </Button>
        )}
      </div>

      <RoomInfoCard />

      <NotificationsCard instanceId={instanceId} />

      <InstanceConfig instanceId={instanceId} />
    </DashboardShell>
  );
}
