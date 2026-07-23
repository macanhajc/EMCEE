import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import emceeSchemaV1 from "@botmarket/schemas/emcee/v1";
import { auth } from "@/auth";
import { openBillingPortal } from "@/app/[locale]/checkout/actions";
import { InstanceDetailTemplate } from "@/modules/instances/[id]";
import { db, tables } from "@/db";
import { getActiveSubscriptionForInstance } from "@/db/billing";
import { getAvatarPosition } from "@/db/avatar-positions";
import { getRegulars } from "@/db/greeter-visits";
import { getOwnedInstance } from "@/db/instances";
import { getRecentOperationalEvents } from "@/db/operational-events";
import { getRecentModerationEvents } from "@/db/warden-events";
import { getOutfitItemsByIds, getRoomInfo } from "@/lib/highrise-webapi";
import { sectionsFromSchema } from "@/lib/schema-form";
import {
  deleteInstance,
  getInstanceStatus,
  replaceRoomId,
  replaceToken,
  requestModeration,
  searchOutfitItems,
  setBotRunning,
  setBrowserAlertsEnabled,
  updateAvatarPosition,
  updateConfig,
  updateEmailAlerts,
} from "./actions";

const SCHEMAS: Record<string, object> = { emcee: emceeSchemaV1 };

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
    operationalEvents,
    avatarPosition,
    roomInfo,
    outfitItems,
    tInstance,
    tSchema,
  ] = await Promise.all([
    getActiveSubscriptionForInstance(id),
    db
      .select()
      .from(tables.catalogBots)
      .where(eq(tables.catalogBots.slug, instance.catalogBotSlug)),
    db.select().from(tables.users).where(eq(tables.users.id, session!.user.id)),
    getRegulars(id),
    getRecentModerationEvents(id),
    getRecentOperationalEvents(id),
    getAvatarPosition(id),
    getRoomInfo(instance.roomId),
    getOutfitItemsByIds(outfitItemIds),
    getTranslations("instanceDetail"),
    getTranslations("schemaEmcee"),
  ]);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const sections = sectionsFromSchema(schema, (path) =>
    tSchema.has(path) ? (tSchema.raw(path) as string) : undefined,
  );

  return (
    <InstanceDetailTemplate
      email={session!.user.email ?? ""}
      role={session!.user.role}
      hasBilling={Boolean(user?.stripeCustomerId)}
      emailAlertsEnabled={user?.emailAlertsEnabled ?? true}
      browserAlertsEnabled={user?.browserAlertsEnabled ?? false}
      instance={instance}
      bot={bot}
      subscription={subscription}
      successMessage={
        checkout === "success"
          ? tInstance("checkoutSuccessMessage")
          : saved
            ? tInstance("savedMessage")
            : undefined
      }
      errorMessage={
        error ? (tInstance.has(`errors.${error}`) ? tInstance(`errors.${error}`) : decodeURIComponent(error)) : undefined
      }
      roomInfo={roomInfo}
      regulars={regulars}
      moderationEvents={moderationEvents}
      operationalEvents={operationalEvents}
      sections={sections}
      config={config}
      avatarPosition={avatarPosition}
      outfitItems={outfitItems}
      setBotRunning={setBotRunning.bind(null, instance.id, !instance.userEnabled)}
      openBillingPortal={openBillingPortal}
      updateConfig={updateConfig.bind(null, instance.id)}
      updateAvatarPosition={updateAvatarPosition.bind(null, instance.id)}
      searchOutfitItems={searchOutfitItems}
      replaceToken={replaceToken.bind(null, instance.id)}
      replaceRoomId={replaceRoomId.bind(null, instance.id)}
      deleteInstance={deleteInstance.bind(null, instance.id)}
      requestModeration={requestModeration.bind(null, instance.id)}
      updateEmailAlerts={updateEmailAlerts.bind(null, instance.id)}
      setBrowserAlertsEnabled={setBrowserAlertsEnabled.bind(null, instance.id)}
      getInstanceStatus={getInstanceStatus.bind(null, instance.id)}
    />
  );
}
