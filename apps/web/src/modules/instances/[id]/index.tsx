import { ArrowLeft, Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ConfigActionState } from "@/app/[locale]/instances/[id]/actions";
import { DashboardShell } from "@/components/Elements/dashboard-shell";
import {
  InstanceStatusBadge,
  SubscriptionBadge,
} from "@/components/Elements/instance-status";
import { QueryToast } from "@/components/Elements/query-toast";
import { Button } from "@/components/UI/button";
import type { botInstances, catalogBots, subscriptions } from "@/db/schema";
import type { RoomInfo, OutfitItemInfo } from "@/lib/highrise-webapi";
import type { SectionSpec } from "@/lib/schema-form";
import { ActivityLog } from "./components/activity-log";
import { InstanceConfig, type AvatarPositionValue } from "./components/instance-config";
import { NotificationsCard } from "./components/notifications-card";
import { RegularsTable } from "./components/regulars-table";
import { RoomInfoCard } from "./components/room-info-card";
import type { StatusLog } from "./components/status-log";

type Instance = typeof botInstances.$inferSelect;
type CatalogBot = typeof catalogBots.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;

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
  regulars,
  moderationEvents,
  operationalEvents,
  sections,
  config,
  avatarPosition,
  outfitItems,
  emailAlertsEnabled,
  browserAlertsEnabled,
  setBotRunning,
  openBillingPortal,
  updateConfig,
  updateAvatarPosition,
  searchOutfitItems,
  replaceToken,
  replaceRoomId,
  deleteInstance,
  requestModeration,
  updateEmailAlerts,
  setBrowserAlertsEnabled,
  getInstanceStatus,
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
  regulars: React.ComponentProps<typeof RegularsTable>["regulars"];
  moderationEvents: React.ComponentProps<typeof ActivityLog>["events"];
  operationalEvents: React.ComponentProps<typeof StatusLog>["events"];
  sections: SectionSpec[];
  config: Record<string, Record<string, unknown>>;
  avatarPosition: AvatarPositionValue | null;
  outfitItems: Record<string, OutfitItemInfo>;
  emailAlertsEnabled: boolean;
  browserAlertsEnabled: boolean;
  setBotRunning: () => Promise<void>;
  openBillingPortal: () => Promise<void>;
  updateConfig: (prevState: ConfigActionState | null, formData: FormData) => Promise<ConfigActionState>;
  updateAvatarPosition: (prevState: ConfigActionState | null, formData: FormData) => Promise<ConfigActionState>;
  searchOutfitItems: (query: string) => Promise<OutfitItemInfo[]>;
  replaceToken: (formData: FormData) => Promise<void>;
  replaceRoomId: (formData: FormData) => Promise<void>;
  deleteInstance: (formData: FormData) => Promise<void>;
  requestModeration: (formData: FormData) => Promise<void>;
  updateEmailAlerts: (formData: FormData) => Promise<void>;
  setBrowserAlertsEnabled: (enabled: boolean) => Promise<void>;
  getInstanceStatus: () => Promise<{ status: Instance["status"]; errorKind: Instance["errorKind"] } | null>;
}) {
  const t = useTranslations("instanceDetail");

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
                <form action={setBotRunning}>
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

      <RoomInfoCard room={roomInfo} roomId={instance.roomId} />

      <NotificationsCard
        botName={bot?.name ?? instance.catalogBotSlug}
        initialStatus={instance.status}
        emailAlertsEnabled={emailAlertsEnabled}
        browserAlertsEnabled={browserAlertsEnabled}
        updateEmailAlerts={updateEmailAlerts}
        setBrowserAlertsEnabled={setBrowserAlertsEnabled}
        getInstanceStatus={getInstanceStatus}
      />

      <InstanceConfig
        sections={sections}
        config={config}
        action={updateConfig}
        avatarPosition={avatarPosition}
        onSavePosition={updateAvatarPosition}
        outfitItems={outfitItems}
        onSearchOutfitItems={searchOutfitItems}
        operationalEvents={operationalEvents}
        instanceId={instance.id}
        status={instance.status}
        errorKind={instance.errorKind}
        tokenLast4={instance.tokenLast4 ?? ""}
        replaceToken={replaceToken}
        roomId={instance.roomId}
        replaceRoomId={replaceRoomId}
        isSubscribed={!!subscription}
        openBillingPortal={openBillingPortal}
        deleteInstance={deleteInstance}
        botName={bot?.name ?? instance.catalogBotSlug}
        regulars={regulars}
        moderationEvents={moderationEvents}
        requestModeration={requestModeration}
      />
    </DashboardShell>
  );
}
