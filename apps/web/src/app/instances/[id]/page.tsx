import { eq } from "drizzle-orm";
import { ArrowLeft, Lock, Play, Square } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import emceeSchemaV1 from "@botmarket/schemas/emcee/v1";
import { auth } from "@/auth";
import { openBillingPortal } from "@/app/checkout/actions";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { InstanceConfig } from "@/components/dashboard/instance-config";
import {
  InstanceStatusBadge,
  SubscriptionBadge,
} from "@/components/dashboard/instance-status";
import { ActivityLog } from "@/components/dashboard/activity-log";
import { RegularsTable } from "@/components/dashboard/regulars-table";
import { RoomInfoCard } from "@/components/dashboard/room-info-card";
import { QueryToast } from "@/components/query-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db, tables } from "@/db";
import { getActiveSubscriptionForInstance } from "@/db/billing";
import { getAvatarPosition } from "@/db/avatar-positions";
import { getRegulars } from "@/db/greeter-visits";
import { getOwnedInstance } from "@/db/instances";
import { getRecentModerationEvents } from "@/db/warden-events";
import { getOutfitItemsByIds, getRoomInfo } from "@/lib/highrise-webapi";
import { sectionsFromSchema } from "@/lib/schema-form";
import {
  deleteInstance,
  replaceToken,
  searchOutfitItems,
  setBotRunning,
  updateAvatarPosition,
  updateConfig,
} from "./actions";
import { BotTokenUpdate } from "@/components/dashboard/bot-token-update";
import { BotDangerZone } from "@/components/dashboard/bot-danger-zone";

const SCHEMAS: Record<string, object> = { emcee: emceeSchemaV1 };

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many attempts — try again in a few minutes.",
  bad_token: "That token doesn't look right.",
  bad_position:
    "That position doesn't look right — check the coordinates and facing.",
  delete_not_confirmed: "Check the confirmation box to delete this bot.",
  active_subscription:
    "Cancel the subscription first, then this bot can be deleted.",
  not_subscribed: "Subscribe first — there's nothing to start yet.",
};

export default async function InstancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; checkout?: string }>;
}) {
  const { id } = await params;
  const { error, saved, checkout } = await searchParams;
  const session = await auth(); // proxy.ts guarantees a session on this route
  const instance = await getOwnedInstance(session!.user.id, id);
  if (!instance) notFound();

  const config = instance.config as Record<string, Record<string, unknown>>;
  const defaultOutfitItemIds = Array.isArray(config.default_outfit?.item_ids)
    ? config.default_outfit.item_ids.filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  // Item ids referenced by saved presets ("name: id, id, ..." lines) need
  // resolving too, so the preset editor can show real names/icons instead of
  // raw ids for outfits set up before this editor existed.
  const presetLines = Array.isArray(config.outfit_presets?.presets)
    ? config.outfit_presets.presets.filter((v): v is string => typeof v === "string")
    : [];
  const presetItemIds = presetLines.flatMap((line) => {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) return [];
    return line
      .slice(colonIdx + 1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  });
  const outfitItemIds = Array.from(new Set([...defaultOutfitItemIds, ...presetItemIds]));

  const [
    subscription,
    [bot],
    [user],
    regulars,
    moderationEvents,
    avatarPosition,
    roomInfo,
    outfitItems,
  ] = await Promise.all([
    getActiveSubscriptionForInstance(id),
    db
      .select()
      .from(tables.catalogBots)
      .where(eq(tables.catalogBots.slug, instance.catalogBotSlug)),
    db.select().from(tables.users).where(eq(tables.users.id, session!.user.id)),
    getRegulars(id),
    getRecentModerationEvents(id),
    getAvatarPosition(id),
    getRoomInfo(instance.roomId),
    getOutfitItemsByIds(outfitItemIds),
  ]);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const sections = sectionsFromSchema(schema);

  return (
    <DashboardShell
      email={session!.user.email ?? ""}
      role={session!.user.role}
      hasBilling={Boolean(user?.stripeCustomerId)}
    >
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 font-ui-mono text-xs text-dust hover:text-paper"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        All bots
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl text-paper">
          {bot?.name ?? instance.catalogBotSlug}
        </h1>
        <InstanceStatusBadge
          status={instance.status}
          errorKind={instance.errorKind}
        />
      </div>

      {bot?.tagline && (
        <p className="mt-2 max-w-lg text-sm text-dust">{bot.tagline}</p>
      )}

      <QueryToast
        success={
          checkout === "success"
            ? "Thanks! Your subscription is starting — this page will reflect it shortly."
            : saved
              ? "Saved."
              : undefined
        }
        error={
          error
            ? (ERROR_MESSAGES[error] ?? decodeURIComponent(error))
            : undefined
        }
      />

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-paper/10 bg-panel p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
            Room
          </p>
          <p className="mt-1 font-ui-mono text-sm text-paper">
            {instance.roomId}
          </p>
        </div>
        <div className="h-px w-full bg-paper/10 sm:h-8 sm:w-px" />
        <div>
          <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
            Subscription
          </p>
          <div className="mt-1">
            {subscription ? (
              <SubscriptionBadge status={subscription.status} />
            ) : (
              <span className="font-ui-mono text-xs text-dust">
                Not subscribed
              </span>
            )}
          </div>
        </div>

        {subscription && (
          <>
            <div className="h-px w-full bg-paper/10 sm:h-8 sm:w-px" />
            <div>
              <p className="font-ui-mono text-xs tracking-[0.15em] text-dust uppercase">
                Bot
              </p>
              <div className="mt-1.5">
                <form action={setBotRunning.bind(null, instance.id, !instance.userEnabled)}>
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
                        Stop bot
                      </>
                    ) : (
                      <>
                        <Play aria-hidden className="size-3.5" />
                        Start bot
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
              Manage billing
            </Button>
          </form>
        ) : (
          <Button asChild className="bg-marquee text-ink hover:bg-marquee/85">
            <Link href={`/checkout?instance=${instance.id}`}>
              Subscribe to activate
            </Link>
          </Button>
        )}
      </div>

      <RoomInfoCard room={roomInfo} roomId={instance.roomId} />

      <RegularsTable regulars={regulars} />

      <ActivityLog events={moderationEvents} />

      <InstanceConfig
        sections={sections}
        config={config}
        action={updateConfig.bind(null, instance.id)}
        avatarPosition={avatarPosition}
        onSavePosition={updateAvatarPosition.bind(null, instance.id)}
        outfitItems={outfitItems}
        onSearchOutfitItems={searchOutfitItems}
      />

      <div className="border-t border-paper/10 mt-6" />

      <BotTokenUpdate
        tokenLast4={instance.tokenLast4 ?? ""}
        replaceToken={replaceToken.bind(null, instance.id)}
      />

      <BotDangerZone
        isSubscribed={!!subscription}
        openBillingPortal={openBillingPortal}
        deleteInstance={deleteInstance.bind(null, instance.id)}
        name={bot?.name ?? instance.catalogBotSlug}
      />
    </DashboardShell>
  );
}
