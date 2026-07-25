"use server";

import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import emceeSchemaV1 from "@botmarket/schemas/emcee/v1";
import { auth } from "@/auth";
import { redirect } from "@/i18n/redirect";
import type { AppLocale } from "@/i18n/routing";
import { db, tables } from "@/db";
import { getActiveSubscriptionForInstance } from "@/db/billing";
import { getRegulars } from "@/db/greeter-visits";
import { getOwnedInstance } from "@/db/instances";
import { getRecentOperationalEvents } from "@/db/operational-events";
import { getRecentModerationEvents } from "@/db/warden-events";
import { getGreeterTemplateDefaults } from "@/lib/greeter-template-defaults";
import { validateConfig } from "@/lib/schema-validate";
import { publishAvatarPositionUpdated, publishConfigUpdated, publishModerationRequested } from "@/lib/notify";
import { normalizeRoomId } from "@/lib/room-id";
import { sealToken, TokenFormatError, type SealedToken } from "@/lib/token-seal";
import { tokenEntryLimiter } from "@/lib/rate-limit";
import { getAvatarPosition, setAvatarPosition, type AvatarPosition } from "@/db/avatar-positions";
import {
  getOutfitItemsByIds,
  getUserByUsername,
  searchOutfitItems as searchOutfitItemsRemote,
  type OutfitItemInfo,
} from "@/lib/highrise-webapi";

// Facing literal from the SDK (see apps/web/src/db/schema.ts's avatarPositions
// comment) — the only four values Highrise's own Position model accepts.
const VALID_FACINGS = new Set(["FrontRight", "FrontLeft", "BackRight", "BackLeft"]);

const SCHEMAS: Record<string, object> = { emcee: emceeSchemaV1 };

/**
 * Validates just one section's new value against its own subschema —
 * `schema.properties.<sectionKey>` is already a self-contained JSON Schema
 * object (own `type`/`properties`/`additionalProperties`), so this needs
 * nothing from the rest of the document. Used by every dedicated per-card
 * save action below instead of validating the whole merged config.
 *
 * That distinction matters, not just tidier: every dedicated action below
 * spreads `...existingConfig` to build the row it writes, so a section's
 * *stored* data can go stale relative to the *current* schema without ever
 * being re-validated (e.g. Loop's dropped `max_concurrent_loopers` field,
 * docs/decisions.md, 2026-07-23, still sitting in already-saved rows).
 * Validating the *whole* document on every dedicated card's save would
 * re-surface that unrelated staleness and block saves that have nothing to
 * do with it — without this, every save would inherit whatever staleness
 * happens to be sitting in any other section, every time.
 */
function validateSection(schema: object, sectionKey: string, value: unknown): { valid: boolean; errors: string[] } {
  const properties = (schema as { properties?: Record<string, object> }).properties;
  return validateConfig(properties?.[sectionKey] ?? {}, value);
}

/**
 * Result shape for the two `useActionState`-driven forms below (the config
 * form and the Anchor spot position form) — both stay on the instance page
 * and report success/error inline (a client-side toast, `instance-config.tsx`)
 * instead of redirecting with a `?saved=1`/`?error=` query param. A redirect
 * remounts the page's server-rendered tree, which reset whichever module tab
 * (`activeModule` in `instance-config.tsx`) the owner had open — every other
 * action on this page still redirects (that's fine for one-off forms outside
 * the tab-switcher), this pair specifically needed to stop.
 */
export type ConfigActionState = { ok: true } | { ok: false; error: string };

async function requireOwnedInstance(instanceId: string) {
  const session = await auth();
  if (!session?.user) await redirect("/login");
  const instance = await getOwnedInstance(session!.user.id, instanceId);
  if (!instance) await redirect("/dashboard");
  return instance;
}

function parseCoordinate(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Query half of the Anchor spot card's "from dashboard" function — its own
 * component (anchor-from-dashboard-card.tsx) fetches this itself via
 * useAvatarAnchorPosition rather than being handed it down from the page's
 * own server-rendered props. Named distinctly from db/avatar-positions.ts's
 * own `getAvatarPosition` (re-exported here behind an ownership check) to
 * avoid a same-name import collision in every caller.
 */
export async function getAvatarAnchorPosition(instanceId: string): Promise<AvatarPosition | null> {
  await requireOwnedInstance(instanceId);
  return getAvatarPosition(instanceId);
}

/**
 * The Avatar module's "set from the dashboard" path (specs/bots/avatar.md)
 * — an alternative to saying "anchor" in-game. Writes straight to
 * `avatar_positions` (never `bot_instances.config` — coordinates are
 * deliberately kept out of the JSON config, same as the in-game path) and
 * wakes the running instance over a dedicated Postgres NOTIFY channel so it
 * re-teleports live, no reconnect needed.
 */
export async function updateAvatarPosition(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  await requireOwnedInstance(instanceId);

  const x = parseCoordinate(formData.get("x"));
  // const y = parseCoordinate(formData.get("y"));
  const y = 1;
  const z = parseCoordinate(formData.get("z"));
  const facing = String(formData.get("facing") ?? "");

  // Prev: Y is not needed
  // if (x === null || y === null || z === null || !VALID_FACINGS.has(facing)) {
  if (x === null ||z === null || !VALID_FACINGS.has(facing)) {
    return { ok: false, error: "bad_position" };
  }

  await setAvatarPosition(instanceId, { x, y, z, facing });
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "avatar_position_updated", data: {} });
  await publishAvatarPositionUpdated(instanceId);

  return { ok: true };
}

/**
 * Query half of the Anchor spot card's `enabled` toggle — the one field
 * AnchorSpotCard didn't get its own dedicated save for at first (it rode the
 * shared config form on purpose, docs/decisions.md 2026-07-23). That left it
 * unable to auto-save or hide its content on toggle the way every other
 * extracted card's `enabled` does, which is exactly what broke — so it now
 * gets the same treatment.
 */
export async function getAnchorSpotEnabled(instanceId: string): Promise<boolean> {
  const instance = await requireOwnedInstance(instanceId);
  const position = (instance.config as Record<string, Record<string, unknown>>).position ?? {};
  return typeof position.enabled === "boolean" ? position.enabled : true;
}

/**
 * Mutate half — writes `position.enabled`, plus pins `permission`/
 * `allowlist` to owner-only on every save (2026-07-24: the in-game "who can
 * say anchor" dashboard control was removed — only the bot owner can trigger
 * it now, no exceptions). Pinning it here rather than only at the moment of
 * removal means an instance that had a different permission configured
 * before this change gets normalized the next time its Anchor spot card is
 * touched at all, not left stuck on its old setting forever.
 */
export async function updateAnchorSpotEnabled(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    position: { ...existingConfig.position, enabled, permission: "owner", allowlist: [] },
  };

  const { valid } = validateSection(schema, "position", nextConfig.position);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface IdleEmoteLoopConfig {
  enabled: boolean;
  emote_id: string;
  interval_s: number;
}

/**
 * Query half of the Avatar → Idle emote loop card — its own component
 * (idle-emote-loop-card.tsx) fetches this itself via useIdleEmoteLoop rather
 * than being handed `config.idle_emote` down from the page's own
 * server-rendered props.
 */
export async function getIdleEmoteLoopConfig(instanceId: string): Promise<IdleEmoteLoopConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const idleEmote = (instance.config as Record<string, Record<string, unknown>>).idle_emote ?? {};
  return {
    enabled: typeof idleEmote.enabled === "boolean" ? idleEmote.enabled : false,
    emote_id: typeof idleEmote.emote_id === "string" ? idleEmote.emote_id : "",
    interval_s: typeof idleEmote.interval_s === "number" ? idleEmote.interval_s : 60,
  };
}

/**
 * Mutate half — writes only `idle_emote`, leaving every other section
 * untouched, same shape as every other dedicated card action. Unlike
 * Anchor spot's two sub-cards, Idle emote loop is a single function, so
 * `enabled` moves with it here rather than staying on the generic form.
 */
export async function updateIdleEmoteLoopConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const emoteId = String(formData.get("emote_id") ?? "");
  const intervalRaw = formData.get("interval_s");
  const intervalS = intervalRaw === null || intervalRaw === "" ? undefined : Number(intervalRaw);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    idle_emote: { enabled, emote_id: emoteId, interval_s: intervalS },
  };

  const { valid } = validateSection(schema, "idle_emote", nextConfig.idle_emote);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface ReactionBackConfig {
  enabled: boolean;
  cooldown_s: number;
}

/**
 * Query half of the Avatar → Reaction back card — its own component
 * (reaction-back-card.tsx) fetches this itself via useReactionBack rather
 * than being handed `config.reaction_back` down from the page's own
 * server-rendered props.
 */
export async function getReactionBackConfig(instanceId: string): Promise<ReactionBackConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const reactionBack = (instance.config as Record<string, Record<string, unknown>>).reaction_back ?? {};
  return {
    enabled: typeof reactionBack.enabled === "boolean" ? reactionBack.enabled : true,
    cooldown_s: typeof reactionBack.cooldown_s === "number" ? reactionBack.cooldown_s : 2,
  };
}

/**
 * Mutate half — writes only `reaction_back`, leaving every other section
 * untouched, same shape as `updateIdleEmoteLoopConfig` above. A single
 * function like Idle emote loop, so `enabled` moves with it here rather than
 * staying on the generic form.
 */
export async function updateReactionBackConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const cooldownRaw = formData.get("cooldown_s");
  const cooldownS = cooldownRaw === null || cooldownRaw === "" ? undefined : Number(cooldownRaw);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    reaction_back: { enabled, cooldown_s: cooldownS },
  };

  const { valid } = validateSection(schema, "reaction_back", nextConfig.reaction_back);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface DefaultOutfitConfig {
  enabled: boolean;
  item_ids: string[];
  resolvedItems: Record<string, OutfitItemInfo>;
}

/**
 * Query half of the Avatar → Default outfit card — its own component
 * (default-outfit-card.tsx) fetches this itself via useDefaultOutfit rather
 * than being handed `config.default_outfit` (and the resolved item catalog
 * info the page used to precompute) down from the page's own server-rendered
 * props. Bundles the Highrise catalog resolution (`getOutfitItemsByIds`) in
 * with the raw ids so this card is fully self-contained in one round trip.
 */
export async function getDefaultOutfitConfig(instanceId: string): Promise<DefaultOutfitConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const defaultOutfit = (instance.config as Record<string, Record<string, unknown>>).default_outfit ?? {};
  const itemIds = Array.isArray(defaultOutfit.item_ids)
    ? defaultOutfit.item_ids.filter((v): v is string => typeof v === "string")
    : [];
  const resolvedItems = await getOutfitItemsByIds(itemIds);
  return {
    enabled: typeof defaultOutfit.enabled === "boolean" ? defaultOutfit.enabled : true,
    item_ids: itemIds,
    resolvedItems,
  };
}

/**
 * Mutate half — writes only `default_outfit`, leaving every other section
 * untouched, same shape as `updateReactionBackConfig` above.
 */
export async function updateDefaultOutfitConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const itemIds = String(formData.get("item_ids") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    default_outfit: { enabled, item_ids: itemIds },
  };

  const { valid } = validateSection(schema, "default_outfit", nextConfig.default_outfit);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface OutfitPresetsConfig {
  enabled: boolean;
  presets: string[];
  resolvedItems: Record<string, OutfitItemInfo>;
}

/** Item ids referenced across all "name: item_id, item_id, ..." preset lines. */
function itemIdsFromPresetLines(lines: string[]): string[] {
  return Array.from(
    new Set(
      lines.flatMap((line) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx === -1) return [];
        return line
          .slice(colonIdx + 1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }),
    ),
  );
}

/**
 * Query half of the Avatar → Named outfit presets card — its own component
 * (outfit-presets-card.tsx) fetches this itself via useOutfitPresets rather
 * than being handed `config.outfit_presets` (and the resolved item catalog
 * info the page used to precompute) down from the page's own server-rendered
 * props. Bundles the Highrise catalog resolution for every item id
 * referenced across all preset lines in with the raw config so this card is
 * fully self-contained in one round trip, same shape as
 * getDefaultOutfitConfig above. No `permission`/`allowlist` in the returned
 * shape — see `updateOutfitPresetsConfig` below.
 */
export async function getOutfitPresetsConfig(instanceId: string): Promise<OutfitPresetsConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const outfitPresets = (instance.config as Record<string, Record<string, unknown>>).outfit_presets ?? {};
  const presets = Array.isArray(outfitPresets.presets)
    ? outfitPresets.presets.filter((v): v is string => typeof v === "string")
    : [];
  const resolvedItems = await getOutfitItemsByIds(itemIdsFromPresetLines(presets));
  return {
    enabled: typeof outfitPresets.enabled === "boolean" ? outfitPresets.enabled : true,
    presets,
    resolvedItems,
  };
}

/**
 * Mutate half — writes only `outfit_presets`, leaving every other section
 * untouched, same shape as `updateDefaultOutfitConfig` above.
 *
 * `permission`/`allowlist` are pinned to owner-only unconditionally
 * (2026-07-24: "who can switch looks" dashboard control removed — only the
 * bot owner can use "look <name>" now). Pinning on every save rather than
 * just at the moment of removal means an instance that had a different
 * permission configured before this change gets normalized the next time
 * this card is saved at all, not left stuck on its old setting forever.
 */
export async function updateOutfitPresetsConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const presets = String(formData.get("presets") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    outfit_presets: { enabled, permission: "owner", allowlist: [], presets },
  };

  const { valid } = validateSection(schema, "outfit_presets", nextConfig.outfit_presets);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface OutfitCloneConfig {
  enabled: boolean;
  min_match: number;
}

/**
 * Query half of the Avatar → Copy a look card — its own component
 * (outfit-clone-card.tsx) fetches this itself via useOutfitClone rather than
 * being handed `config.outfit_clone` down from the page's own
 * server-rendered props. No outfit-item catalog resolution needed here
 * (unlike default_outfit/outfit_presets) — "copy" targets whatever the
 * target user is wearing live, not a saved item list. No `permission`/
 * `allowlist` in the returned shape — see `updateOutfitCloneConfig` below.
 */
export async function getOutfitCloneConfig(instanceId: string): Promise<OutfitCloneConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const outfitClone = (instance.config as Record<string, Record<string, unknown>>).outfit_clone ?? {};
  return {
    enabled: typeof outfitClone.enabled === "boolean" ? outfitClone.enabled : true,
    min_match: typeof outfitClone.min_match === "number" ? outfitClone.min_match : 2,
  };
}

/**
 * Mutate half — writes only `outfit_clone`, leaving every other section
 * untouched, same shape as `updateOutfitPresetsConfig` above.
 *
 * `permission`/`allowlist` are pinned to owner-only unconditionally
 * (2026-07-24: "who can trigger it" dashboard control removed — only the bot
 * owner can use "copy <username>" now). Pinning on every save rather than
 * just at the moment of removal means an instance that had a different
 * permission configured before this change gets normalized the next time
 * this card is saved at all, not left stuck on its old setting forever.
 */
export async function updateOutfitCloneConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const minMatchRaw = formData.get("min_match");
  const minMatch = minMatchRaw === null || minMatchRaw === "" ? undefined : Number(minMatchRaw);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    outfit_clone: { enabled, permission: "owner", allowlist: [], min_match: minMatch },
  };

  const { valid } = validateSection(schema, "outfit_clone", nextConfig.outfit_clone);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface FilterConfig {
  enabled: boolean;
  custom_terms: string[];
}

/**
 * Query half of the Moderation → Word filter card — its own component
 * (filter-card.tsx) fetches this itself via useFilter rather than being
 * handed `config.filter` down from the page's own server-rendered props.
 */
export async function getFilterConfig(instanceId: string): Promise<FilterConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const filter = (instance.config as Record<string, Record<string, unknown>>).filter ?? {};
  return {
    enabled: typeof filter.enabled === "boolean" ? filter.enabled : true,
    custom_terms: Array.isArray(filter.custom_terms)
      ? filter.custom_terms.filter((v): v is string => typeof v === "string")
      : [],
  };
}

/**
 * Mutate half — writes only `filter`, leaving every other section untouched,
 * same shape as the Avatar module's dedicated card actions.
 */
export async function updateFilterConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const customTerms = String(formData.get("custom_terms") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    filter: { enabled, custom_terms: customTerms },
  };

  const { valid } = validateSection(schema, "filter", nextConfig.filter);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface AntiSpamConfig {
  enabled: boolean;
  message_rate_count: number;
  message_rate_window_s: number;
  duplicate_count: number;
}

/**
 * Query half of the Moderation → Anti-spam card — its own component
 * (anti-spam-card.tsx) fetches this itself via useAntiSpam rather than being
 * handed `config.anti_spam` down from the page's own server-rendered props.
 */
export async function getAntiSpamConfig(instanceId: string): Promise<AntiSpamConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const antiSpam = (instance.config as Record<string, Record<string, unknown>>).anti_spam ?? {};
  return {
    enabled: typeof antiSpam.enabled === "boolean" ? antiSpam.enabled : true,
    message_rate_count: typeof antiSpam.message_rate_count === "number" ? antiSpam.message_rate_count : 5,
    message_rate_window_s: typeof antiSpam.message_rate_window_s === "number" ? antiSpam.message_rate_window_s : 10,
    duplicate_count: typeof antiSpam.duplicate_count === "number" ? antiSpam.duplicate_count : 3,
  };
}

/**
 * Mutate half — writes only `anti_spam`, leaving every other section
 * untouched, same shape as `updateFilterConfig` above.
 */
export async function updateAntiSpamConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const messageRateCountRaw = formData.get("message_rate_count");
  const messageRateCount =
    messageRateCountRaw === null || messageRateCountRaw === "" ? undefined : Number(messageRateCountRaw);
  const messageRateWindowRaw = formData.get("message_rate_window_s");
  const messageRateWindowS =
    messageRateWindowRaw === null || messageRateWindowRaw === "" ? undefined : Number(messageRateWindowRaw);
  const duplicateCountRaw = formData.get("duplicate_count");
  const duplicateCount = duplicateCountRaw === null || duplicateCountRaw === "" ? undefined : Number(duplicateCountRaw);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    anti_spam: {
      enabled,
      message_rate_count: messageRateCount,
      message_rate_window_s: messageRateWindowS,
      duplicate_count: duplicateCount,
    },
  };

  const { valid } = validateSection(schema, "anti_spam", nextConfig.anti_spam);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface LadderConfig {
  strike_decay_h: number;
  mute_at_strikes: number;
  mute_duration_s: number;
  kick_at_strikes: number;
  ban_enabled: boolean;
  ban_at_strikes: number;
  ban_duration_s: number;
}

/**
 * Query half of the Moderation → Warning escalation card (schema section key
 * `ladder`) — its own component (strike-escalation-card.tsx) fetches this
 * itself via useStrikeEscalation rather than being handed `config.ladder`
 * down from the page's own server-rendered props.
 */
export async function getLadderConfig(instanceId: string): Promise<LadderConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const ladder = (instance.config as Record<string, Record<string, unknown>>).ladder ?? {};
  return {
    strike_decay_h: typeof ladder.strike_decay_h === "number" ? ladder.strike_decay_h : 24,
    mute_at_strikes: typeof ladder.mute_at_strikes === "number" ? ladder.mute_at_strikes : 2,
    mute_duration_s: typeof ladder.mute_duration_s === "number" ? ladder.mute_duration_s : 300,
    kick_at_strikes: typeof ladder.kick_at_strikes === "number" ? ladder.kick_at_strikes : 3,
    ban_enabled: typeof ladder.ban_enabled === "boolean" ? ladder.ban_enabled : false,
    ban_at_strikes: typeof ladder.ban_at_strikes === "number" ? ladder.ban_at_strikes : 5,
    ban_duration_s: typeof ladder.ban_duration_s === "number" ? ladder.ban_duration_s : 0,
  };
}

/**
 * Mutate half — writes only `ladder`, leaving every other section untouched.
 * Unlike every other dedicated card action, there's no top-level `enabled`
 * here (the schema section has none) — every field always submits together
 * on this card's one Save button, including `ban_enabled`, which only gates
 * `ban_at_strikes`/`ban_duration_s`'s visibility client-side (the schema's
 * `x-enabled-by`), not a section-level toggle in its own right.
 */
export async function updateLadderConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const strikeDecayRaw = formData.get("strike_decay_h");
  const strikeDecayH = strikeDecayRaw === null || strikeDecayRaw === "" ? undefined : Number(strikeDecayRaw);
  const muteAtRaw = formData.get("mute_at_strikes");
  const muteAtStrikes = muteAtRaw === null || muteAtRaw === "" ? undefined : Number(muteAtRaw);
  const muteDurationRaw = formData.get("mute_duration_s");
  const muteDurationS = muteDurationRaw === null || muteDurationRaw === "" ? undefined : Number(muteDurationRaw);
  const kickAtRaw = formData.get("kick_at_strikes");
  const kickAtStrikes = kickAtRaw === null || kickAtRaw === "" ? undefined : Number(kickAtRaw);
  const banEnabled = formData.get("ban_enabled") === "on";
  const banAtRaw = formData.get("ban_at_strikes");
  const banAtStrikes = banAtRaw === null || banAtRaw === "" ? undefined : Number(banAtRaw);
  const banDurationRaw = formData.get("ban_duration_s");
  const banDurationS = banDurationRaw === null || banDurationRaw === "" ? undefined : Number(banDurationRaw);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    ladder: {
      strike_decay_h: strikeDecayH,
      mute_at_strikes: muteAtStrikes,
      mute_duration_s: muteDurationS,
      kick_at_strikes: kickAtStrikes,
      ban_enabled: banEnabled,
      ban_at_strikes: banAtStrikes,
      ban_duration_s: banDurationS,
    },
  };

  const { valid } = validateSection(schema, "ladder", nextConfig.ladder);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface ExemptionsConfig {
  designers_exempt: boolean;
  users: string[];
}

/**
 * Query half of the Moderation → Exemptions card — its own component
 * (exemptions-card.tsx) fetches this itself via useExemptions rather than
 * being handed `config.exemptions` down from the page's own server-rendered
 * props.
 */
export async function getExemptionsConfig(instanceId: string): Promise<ExemptionsConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const exemptions = (instance.config as Record<string, Record<string, unknown>>).exemptions ?? {};
  return {
    designers_exempt: typeof exemptions.designers_exempt === "boolean" ? exemptions.designers_exempt : true,
    users: Array.isArray(exemptions.users)
      ? exemptions.users.filter((v): v is string => typeof v === "string")
      : [],
  };
}

/**
 * Mutate half — writes only `exemptions`, leaving every other section
 * untouched. No top-level `enabled` here either (same reason as
 * `updateLadderConfig` above) — `designers_exempt` and `users` submit
 * together on this card's one Save button.
 */
export async function updateExemptionsConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const designersExempt = formData.get("designers_exempt") === "on";
  const users = String(formData.get("users") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    exemptions: { designers_exempt: designersExempt, users },
  };

  const { valid } = validateSection(schema, "exemptions", nextConfig.exemptions);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface ModCommandsConfig {
  enabled: boolean;
  prefix: string;
}

/**
 * Query half of the Moderation → Mod commands card (schema section key
 * `commands`) — its own component (mod-commands-card.tsx) fetches this
 * itself via useModCommands rather than being handed `config.commands` down
 * from the page's own server-rendered props.
 */
export async function getModCommandsConfig(instanceId: string): Promise<ModCommandsConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const commands = (instance.config as Record<string, Record<string, unknown>>).commands ?? {};
  return {
    enabled: typeof commands.enabled === "boolean" ? commands.enabled : true,
    prefix: typeof commands.prefix === "string" ? commands.prefix : "!",
  };
}

/**
 * Mutate half — writes only `commands`, leaving every other section
 * untouched, same shape as `updateFilterConfig` above.
 */
export async function updateModCommandsConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const prefix = String(formData.get("prefix") ?? "!");

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    commands: { enabled, prefix },
  };

  const { valid } = validateSection(schema, "commands", nextConfig.commands);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

const VALID_BOT_LANGUAGES = new Set(["en", "es", "de", "pt", "ru"]);

export interface GeneralConfig {
  bot_language: string;
}

/**
 * Query half of the Status → Bot language card — its own component
 * (general-card.tsx) fetches this itself via useGeneral rather than being
 * handed `config.general` down from the page's own server-rendered props.
 * Bot-wide, not tied to any one feature module (Emote/Concierge/Warden/
 * Avatar), so it lives on the Status tab alongside the other instance-wide
 * cards (`BotTokenUpdate`/`StatusLog`/`BotDangerZone`) rather than any of
 * the module tabs.
 */
export async function getGeneralConfig(instanceId: string): Promise<GeneralConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const general = (instance.config as Record<string, Record<string, unknown>>).general ?? {};
  return {
    bot_language:
      typeof general.bot_language === "string" && VALID_BOT_LANGUAGES.has(general.bot_language)
        ? general.bot_language
        : "en",
  };
}

/**
 * Mutate half — writes only `general`, leaving every other section
 * untouched, same shape as every other dedicated card action. No top-level
 * `enabled` here (the schema section has none) — `bot_language` is always
 * "on", there's no concept of turning it off.
 */
export async function updateGeneralConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const botLanguage = String(formData.get("bot_language") ?? "en");

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    general: { bot_language: botLanguage },
  };

  const { valid } = validateSection(schema, "general", nextConfig.general);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface ActivationMessageConfig {
  enabled: boolean;
  template: string;
  cooldown_m: number;
}

/**
 * Query half of the Greeter → Activation message card — its own component
 * (activation-message-card.tsx) fetches this itself via useActivationMessage
 * rather than being handed `config.activation_message` down from the page's
 * own server-rendered props. `template`'s fallback (never-saved section)
 * uses the current viewer's locale, same reasoning as `getWelcomeConfig`
 * below.
 */
export async function getActivationMessageConfig(instanceId: string): Promise<ActivationMessageConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const activationMessage = (instance.config as Record<string, Record<string, unknown>>).activation_message ?? {};
  const localized = getGreeterTemplateDefaults((await getLocale()) as AppLocale);
  return {
    enabled: typeof activationMessage.enabled === "boolean" ? activationMessage.enabled : false,
    template:
      typeof activationMessage.template === "string"
        ? activationMessage.template
        : localized.activationMessageTemplate,
    cooldown_m: typeof activationMessage.cooldown_m === "number" ? activationMessage.cooldown_m : 10,
  };
}

/**
 * Mutate half — writes only `activation_message`, leaving every other
 * section untouched, same shape as every other dedicated card action.
 */
export async function updateActivationMessageConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const template = String(formData.get("template") ?? "");
  const cooldownRaw = formData.get("cooldown_m");
  const cooldownM = cooldownRaw === null || cooldownRaw === "" ? undefined : Number(cooldownRaw);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    activation_message: { enabled, template, cooldown_m: cooldownM },
  };

  const { valid } = validateSection(schema, "activation_message", nextConfig.activation_message);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface WelcomeConfig {
  enabled: boolean;
  templates: string[];
  cooldown_h: number;
  busy_mode_enabled: boolean;
  busy_mode_joins_per_min: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_tz: string;
}

/**
 * Query half of the Greeter → Welcome messages card — its own component
 * (welcome-card.tsx) fetches this itself via useWelcome rather than being
 * handed `config.welcome` down from the page's own server-rendered props.
 * `templates`'s fallback (never-saved section) uses the current viewer's
 * locale rather than the schema's own hardcoded English default — see
 * lib/greeter-template-defaults.ts.
 */
export async function getWelcomeConfig(instanceId: string): Promise<WelcomeConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const welcome = (instance.config as Record<string, Record<string, unknown>>).welcome ?? {};
  const localized = getGreeterTemplateDefaults((await getLocale()) as AppLocale);
  return {
    enabled: typeof welcome.enabled === "boolean" ? welcome.enabled : true,
    templates:
      Array.isArray(welcome.templates) && welcome.templates.length > 0
        ? welcome.templates.filter((v): v is string => typeof v === "string")
        : localized.welcomeTemplates,
    cooldown_h: typeof welcome.cooldown_h === "number" ? welcome.cooldown_h : 6,
    busy_mode_enabled: typeof welcome.busy_mode_enabled === "boolean" ? welcome.busy_mode_enabled : true,
    busy_mode_joins_per_min:
      typeof welcome.busy_mode_joins_per_min === "number" ? welcome.busy_mode_joins_per_min : 15,
    quiet_hours_enabled: typeof welcome.quiet_hours_enabled === "boolean" ? welcome.quiet_hours_enabled : false,
    quiet_hours_start: typeof welcome.quiet_hours_start === "string" ? welcome.quiet_hours_start : "22:00",
    quiet_hours_end: typeof welcome.quiet_hours_end === "string" ? welcome.quiet_hours_end : "08:00",
    quiet_hours_tz: typeof welcome.quiet_hours_tz === "string" ? welcome.quiet_hours_tz : "UTC",
  };
}

/**
 * Mutate half — writes only `welcome`, leaving every other section
 * untouched, same shape as every other dedicated card action.
 */
export async function updateWelcomeConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const templates = String(formData.get("templates") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const cooldownRaw = formData.get("cooldown_h");
  const cooldownH = cooldownRaw === null || cooldownRaw === "" ? undefined : Number(cooldownRaw);
  const busyModeEnabled = formData.get("busy_mode_enabled") === "on";
  const busyModeJoinsRaw = formData.get("busy_mode_joins_per_min");
  const busyModeJoinsPerMin =
    busyModeJoinsRaw === null || busyModeJoinsRaw === "" ? undefined : Number(busyModeJoinsRaw);
  const quietHoursEnabled = formData.get("quiet_hours_enabled") === "on";
  const quietHoursStart = String(formData.get("quiet_hours_start") ?? "");
  const quietHoursEnd = String(formData.get("quiet_hours_end") ?? "");
  const quietHoursTz = String(formData.get("quiet_hours_tz") ?? "");

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    welcome: {
      enabled,
      templates,
      cooldown_h: cooldownH,
      busy_mode_enabled: busyModeEnabled,
      busy_mode_joins_per_min: busyModeJoinsPerMin,
      quiet_hours_enabled: quietHoursEnabled,
      quiet_hours_start: quietHoursStart,
      quiet_hours_end: quietHoursEnd,
      quiet_hours_tz: quietHoursTz,
    },
  };

  const { valid } = validateSection(schema, "welcome", nextConfig.welcome);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface VipConfig {
  users: string[];
  template: string;
  announce_to_room: boolean;
  emote_celebration_enabled: boolean;
  emote_celebration_id: string;
}

/**
 * Query half of the Greeter → VIP recognition card — its own component
 * (vip-card.tsx) fetches this itself via useVip rather than being handed
 * `config.vip` down from the page's own server-rendered props. `template`'s
 * fallback (never-saved section) uses the current viewer's locale, same
 * reasoning as `getWelcomeConfig` above.
 */
export async function getVipConfig(instanceId: string): Promise<VipConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const vip = (instance.config as Record<string, Record<string, unknown>>).vip ?? {};
  const localized = getGreeterTemplateDefaults((await getLocale()) as AppLocale);
  return {
    users: Array.isArray(vip.users) ? vip.users.filter((v): v is string => typeof v === "string") : [],
    template: typeof vip.template === "string" ? vip.template : localized.vipTemplate,
    announce_to_room: typeof vip.announce_to_room === "boolean" ? vip.announce_to_room : false,
    emote_celebration_enabled:
      typeof vip.emote_celebration_enabled === "boolean" ? vip.emote_celebration_enabled : false,
    emote_celebration_id: typeof vip.emote_celebration_id === "string" ? vip.emote_celebration_id : "",
  };
}

/**
 * Mutate half — writes only `vip`, leaving every other section untouched.
 * No top-level `enabled` here (the schema section has none) — every field
 * always submits together on this card's one Save button, including
 * `emote_celebration_enabled`, which only gates `emote_celebration_id`'s
 * visibility client-side (the schema's `x-enabled-by`), not a section-level
 * toggle in its own right.
 */
export async function updateVipConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const users = String(formData.get("users") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const template = String(formData.get("template") ?? "");
  const announceToRoom = formData.get("announce_to_room") === "on";
  const emoteCelebrationEnabled = formData.get("emote_celebration_enabled") === "on";
  const emoteCelebrationId = String(formData.get("emote_celebration_id") ?? "");

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    vip: {
      users,
      template,
      announce_to_room: announceToRoom,
      emote_celebration_enabled: emoteCelebrationEnabled,
      emote_celebration_id: emoteCelebrationId,
    },
  };

  const { valid } = validateSection(schema, "vip", nextConfig.vip);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface FarewellConfig {
  log_enabled: boolean;
  min_visits: number;
  public_message: boolean;
  public_template: string;
}

/**
 * Query half of the Greeter → Farewell card — its own component
 * (farewell-card.tsx) fetches this itself via useFarewell rather than being
 * handed `config.farewell` down from the page's own server-rendered props.
 * `public_template`'s fallback (never-saved section) uses the current
 * viewer's locale, same reasoning as `getWelcomeConfig` above.
 */
export async function getFarewellConfig(instanceId: string): Promise<FarewellConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const farewell = (instance.config as Record<string, Record<string, unknown>>).farewell ?? {};
  const localized = getGreeterTemplateDefaults((await getLocale()) as AppLocale);
  return {
    log_enabled: typeof farewell.log_enabled === "boolean" ? farewell.log_enabled : true,
    min_visits: typeof farewell.min_visits === "number" ? farewell.min_visits : 3,
    public_message: typeof farewell.public_message === "boolean" ? farewell.public_message : false,
    public_template:
      typeof farewell.public_template === "string" ? farewell.public_template : localized.farewellPublicTemplate,
  };
}

/**
 * Mutate half — writes only `farewell`, leaving every other section
 * untouched. Unlike every other section with its own on/off switch, this
 * one isn't literally named `enabled` (the schema calls it `log_enabled`) —
 * treated the same way regardless (auto-save-on-toggle, content hidden
 * while off), since it functions identically: `min_visits`/`public_message`/
 * `public_template` are all meaningless while farewell logging itself is
 * off.
 */
export async function updateFarewellConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const logEnabled = formData.get("log_enabled") === "on";
  const minVisitsRaw = formData.get("min_visits");
  const minVisits = minVisitsRaw === null || minVisitsRaw === "" ? undefined : Number(minVisitsRaw);
  const publicMessage = formData.get("public_message") === "on";
  const publicTemplate = String(formData.get("public_template") ?? "");

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    farewell: {
      log_enabled: logEnabled,
      min_visits: minVisits,
      public_message: publicMessage,
      public_template: publicTemplate,
    },
  };

  const { valid } = validateSection(schema, "farewell", nextConfig.farewell);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface EmoteOnSayConfig {
  enabled: boolean;
  cooldown_s: number;
  disabled_emotes: string[];
}

/**
 * Query half of the Emotes → Emote on say card — its own component
 * (emote-on-say-card.tsx) fetches this itself via useEmoteOnSay rather than
 * being handed `config.emote_on_say` down from the page's own server-
 * rendered props.
 */
export async function getEmoteOnSayConfig(instanceId: string): Promise<EmoteOnSayConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const emoteOnSay = (instance.config as Record<string, Record<string, unknown>>).emote_on_say ?? {};
  return {
    enabled: typeof emoteOnSay.enabled === "boolean" ? emoteOnSay.enabled : true,
    cooldown_s: typeof emoteOnSay.cooldown_s === "number" ? emoteOnSay.cooldown_s : 3,
    disabled_emotes: Array.isArray(emoteOnSay.disabled_emotes)
      ? emoteOnSay.disabled_emotes.filter((v): v is string => typeof v === "string")
      : [],
  };
}

/**
 * Mutate half — writes only `emote_on_say`, leaving every other section
 * untouched, same shape as every other dedicated card action.
 */
export async function updateEmoteOnSayConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const cooldownRaw = formData.get("cooldown_s");
  const cooldownS = cooldownRaw === null || cooldownRaw === "" ? undefined : Number(cooldownRaw);
  const disabledEmotes = String(formData.get("disabled_emotes") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    emote_on_say: { enabled, cooldown_s: cooldownS, disabled_emotes: disabledEmotes },
  };

  const { valid } = validateSection(schema, "emote_on_say", nextConfig.emote_on_say);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

const VALID_EMOTE_ALL_PERMISSIONS = new Set(["owner", "owner_designers", "allowlist"]);

export interface EmoteAllConfig {
  enabled: boolean;
  permission: string;
  allowlist: string[];
  cooldown_s: number;
}

/**
 * Query half of the Emotes → Emote all card — its own component
 * (emote-all-card.tsx) fetches this itself via useEmoteAll rather than being
 * handed `config.emote_all` down from the page's own server-rendered props.
 */
export async function getEmoteAllConfig(instanceId: string): Promise<EmoteAllConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const emoteAll = (instance.config as Record<string, Record<string, unknown>>).emote_all ?? {};
  return {
    enabled: typeof emoteAll.enabled === "boolean" ? emoteAll.enabled : true,
    permission:
      typeof emoteAll.permission === "string" && VALID_EMOTE_ALL_PERMISSIONS.has(emoteAll.permission)
        ? emoteAll.permission
        : "owner",
    allowlist: Array.isArray(emoteAll.allowlist)
      ? emoteAll.allowlist.filter((v): v is string => typeof v === "string")
      : [],
    cooldown_s: typeof emoteAll.cooldown_s === "number" ? emoteAll.cooldown_s : 60,
  };
}

/**
 * Mutate half — writes only `emote_all`, leaving every other section
 * untouched, same shape as every other dedicated card action.
 */
export async function updateEmoteAllConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const permission = String(formData.get("permission") ?? "owner");
  const allowlist = String(formData.get("allowlist") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const cooldownRaw = formData.get("cooldown_s");
  const cooldownS = cooldownRaw === null || cooldownRaw === "" ? undefined : Number(cooldownRaw);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    emote_all: { enabled, permission, allowlist, cooldown_s: cooldownS },
  };

  const { valid } = validateSection(schema, "emote_all", nextConfig.emote_all);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface ListCommandConfig {
  enabled: boolean;
}

/**
 * Query half of the Emotes → Emote list command card — its own component
 * (list-command-card.tsx) fetches this itself via useListCommand rather than
 * being handed `config.list_command` down from the page's own server-
 * rendered props. The section has exactly one field, `enabled` — no gated
 * content, no Save button, the toggle itself is the entire save action.
 */
export async function getListCommandConfig(instanceId: string): Promise<ListCommandConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const listCommand = (instance.config as Record<string, Record<string, unknown>>).list_command ?? {};
  return {
    enabled: typeof listCommand.enabled === "boolean" ? listCommand.enabled : true,
  };
}

/**
 * Mutate half — writes only `list_command`, leaving every other section
 * untouched.
 */
export async function updateListCommandConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    list_command: { enabled },
  };

  const { valid } = validateSection(schema, "list_command", nextConfig.list_command);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface LoopConfig {
  enabled: boolean;
  interval_s: number;
  max_duration_s: number;
  cooldown_s: number;
}

/**
 * Query half of the Emotes → Loop card — its own component (loop-card.tsx)
 * fetches this itself via useLoop rather than being handed `config.loop`
 * down from the page's own server-rendered props.
 */
export async function getLoopConfig(instanceId: string): Promise<LoopConfig> {
  const instance = await requireOwnedInstance(instanceId);
  const loop = (instance.config as Record<string, Record<string, unknown>>).loop ?? {};
  return {
    enabled: typeof loop.enabled === "boolean" ? loop.enabled : true,
    interval_s: typeof loop.interval_s === "number" ? loop.interval_s : 5,
    max_duration_s: typeof loop.max_duration_s === "number" ? loop.max_duration_s : 1800,
    cooldown_s: typeof loop.cooldown_s === "number" ? loop.cooldown_s : 10,
  };
}

/**
 * Mutate half — writes only `loop`, leaving every other section untouched,
 * same shape as every other dedicated card action.
 */
export async function updateLoopConfig(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const enabled = formData.get("enabled") === "on";
  const intervalRaw = formData.get("interval_s");
  const intervalS = intervalRaw === null || intervalRaw === "" ? undefined : Number(intervalRaw);
  const maxDurationRaw = formData.get("max_duration_s");
  const maxDurationS = maxDurationRaw === null || maxDurationRaw === "" ? undefined : Number(maxDurationRaw);
  const cooldownRaw = formData.get("cooldown_s");
  const cooldownS = cooldownRaw === null || cooldownRaw === "" ? undefined : Number(cooldownRaw);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const existingConfig = instance.config as Record<string, Record<string, unknown>>;
  const nextConfig = {
    ...existingConfig,
    loop: { enabled, interval_s: intervalS, max_duration_s: maxDurationS, cooldown_s: cooldownS },
  };

  const { valid } = validateSection(schema, "loop", nextConfig.loop);
  if (!valid) {
    return { ok: false, error: "invalid_config" };
  }

  await db.update(tables.botInstances).set({ config: nextConfig }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  return { ok: true };
}

export interface BotTokenInfo {
  tokenLast4: string;
  roomId: string;
}

/**
 * Query half of the Status → Bot token card — its own component
 * (bot-token-update.tsx) fetches this itself via useBotTokenUpdate rather
 * than being handed `instance.tokenLast4`/`instance.roomId` down from the
 * page's own server-rendered props.
 */
export async function getBotTokenInfo(instanceId: string): Promise<BotTokenInfo> {
  const instance = await requireOwnedInstance(instanceId);
  return {
    tokenLast4: instance.tokenLast4 ?? "",
    roomId: instance.roomId,
  };
}

/**
 * Mutate half of the Status → Bot token card's "replace token" form —
 * reports success/error inline via `useActionState` (`useBotTokenUpdate`)
 * instead of the redirect-with-query-param banner this used before
 * 2026-07-24: a redirect remounts the whole page, which reset whichever
 * module tab (`activeModule` in `instance-config.tsx`) the owner had open —
 * the exact bug every other dedicated card action already avoids this way.
 */
export async function replaceToken(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  await requireOwnedInstance(instanceId);

  if (!tokenEntryLimiter.attempt(instanceId)) {
    return { ok: false, error: "rate_limited" };
  }

  const token = String(formData.get("token") ?? "");
  // See the matching comment in instances/new/actions.ts.
  let sealed!: SealedToken;
  try {
    sealed = await sealToken(token);
  } catch (err) {
    if (err instanceof TokenFormatError) return { ok: false, error: "bad_token" };
    throw err;
  }

  await db
    .update(tables.botInstances)
    .set({
      tokenCiphertext: sealed.ciphertext,
      tokenKeyRef: sealed.keyRef,
      tokenLast4: sealed.last4,
    })
    .where(eq(tables.botInstances.id, instanceId));

  // No token value in the event payload, ever (specs/05-security.md).
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "token_replaced", data: {} });

  return { ok: true };
}

export interface Regular {
  userId: string;
  username: string;
  visitCount: number;
  lastSeenAt: Date;
}

/**
 * Query half of the Activity → Regulars table card — its own component
 * (regulars-table.tsx) fetches this itself via useRegulars rather than being
 * handed it down from the page's own server-rendered props. Thin wrapper
 * around `db/greeter-visits.ts`'s `getRegulars` adding the same ownership
 * check every other query action here already has — that DB helper is
 * called directly (no auth of its own) from page.tsx's server component
 * today, which is only safe because the page already verified ownership
 * first.
 */
export async function getRegularsList(instanceId: string): Promise<Regular[]> {
  await requireOwnedInstance(instanceId);
  return getRegulars(instanceId);
}

export interface ModerationEvent {
  id: number;
  data: unknown;
  createdAt: Date;
}

/**
 * Query half of the Activity → activity log card — its own component
 * (activity-log.tsx) fetches this itself via useActivityLog rather than
 * being handed it down from the page's own server-rendered props. Thin
 * wrapper around `db/warden-events.ts`'s `getRecentModerationEvents`, same
 * reasoning as `getRegularsList` above.
 */
export async function getActivityLogEvents(instanceId: string): Promise<ModerationEvent[]> {
  await requireOwnedInstance(instanceId);
  return getRecentModerationEvents(instanceId);
}

/**
 * Owner-initiated ban/unban from the dashboard (specs/bots/moderation.md's
 * "proposed" section) — covers both the Regulars table's per-row buttons
 * (target_user_id/target_username already known, passed as hidden fields)
 * and the manual "ban by username" form (only target_username is given; the
 * public webapi resolves it here, so a never-tracked user can still be
 * banned without the bot ever having shared a room with them). Deliberately
 * does not write `instance_events` itself — the data plane owns that write
 * once Highrise actually confirms the action, so the dashboard never shows
 * an activity-log entry ahead of reality (the "saved" toast this reports
 * only claims the *request* was queued, not that the ban itself succeeded).
 * No token, no WebSocket touched here; this only ever inserts a pending row
 * and wakes the supervisor.
 *
 * Reports inline via `useActionState` rather than the redirect-with-
 * query-param banner this used before 2026-07-24, same reasoning as
 * `replaceToken`'s own comment — a redirect remounts the whole page, which
 * reset whichever module tab the owner had open.
 */
export async function requestModeration(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  await requireOwnedInstance(instanceId);
  const session = await auth();

  const rawAction = String(formData.get("action") ?? "");
  if (rawAction !== "ban" && rawAction !== "unban") {
    return { ok: false, error: "invalid_moderation_action" };
  }
  const action = rawAction as "ban" | "unban";

  let targetUserId = String(formData.get("target_user_id") ?? "").trim();
  let targetUsername = String(formData.get("target_username") ?? "").trim();

  if (!targetUserId) {
    if (!targetUsername) return { ok: false, error: "missing_target" };

    const resolved = await getUserByUsername(targetUsername);
    if (!resolved) return { ok: false, error: "user_not_found" };

    targetUserId = resolved!.userId;
    targetUsername = resolved!.username;
  }

  await db.insert(tables.moderationRequests).values({
    botInstanceId: instanceId,
    targetUserId,
    targetUsername,
    action,
    requestedBy: session!.user.id,
  });
  await publishModerationRequested(instanceId);

  return { ok: true };
}

/**
 * Moves this instance to a different Highrise room — same idea as
 * replaceToken above (customer-initiated, write path only, reports inline
 * via `useActionState` rather than a redirect), but for `room_id` instead of
 * the ciphertext. The bot itself needs no code change to pick this up:
 * supervisor.py rereads `room_id` fresh from the row on every reconnect
 * attempt, same as it does for the token.
 */
export async function replaceRoomId(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  await requireOwnedInstance(instanceId);

  const roomId = normalizeRoomId(String(formData.get("room_id") ?? ""));
  if (!roomId) return { ok: false, error: "missing_room" };

  await db.update(tables.botInstances).set({ roomId }).where(eq(tables.botInstances.id, instanceId));

  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "room_id_replaced", data: {} });

  return { ok: true };
}

export interface StatusLogData {
  botName: string;
  roomId: string;
  status: (typeof tables.botInstances.$inferSelect)["status"];
  errorKind: (typeof tables.botInstances.$inferSelect)["errorKind"];
  events: { id: number; kind: string; data: unknown; createdAt: Date }[];
}

/**
 * Query half of the Status → connection log card — its own component
 * (status-log.tsx) fetches this itself via useStatusLog rather than being
 * handed the operational events log / bot name / status down from the
 * page's own server-rendered props.
 */
export async function getStatusLogData(instanceId: string): Promise<StatusLogData> {
  const instance = await requireOwnedInstance(instanceId);
  const [bot, events] = await Promise.all([
    db.select().from(tables.catalogBots).where(eq(tables.catalogBots.slug, instance.catalogBotSlug)),
    getRecentOperationalEvents(instanceId),
  ]);
  return {
    botName: bot[0]?.name ?? instance.catalogBotSlug,
    roomId: instance.roomId,
    status: instance.status,
    errorKind: instance.errorKind,
    events,
  };
}

export interface InstanceHeaderData {
  instance: typeof tables.botInstances.$inferSelect;
  bot: typeof tables.catalogBots.$inferSelect | undefined;
  subscription: Awaited<ReturnType<typeof getActiveSubscriptionForInstance>>;
}

/**
 * Query half of the page header (bot name/status/subscription badge, the
 * start/stop button) — its own component (`index.tsx`) refetches this via
 * `useInstanceHeader` after `setBotRunning` succeeds, so the header stays
 * live without a page reload. `page.tsx`'s own server-side fetch of the same
 * three things stays exactly as it is — this is only the *refresh* path,
 * mirroring `getStatusLogData`'s bundling shape (one round trip for a few
 * related fields shown together).
 */
export async function getInstanceHeaderData(instanceId: string): Promise<InstanceHeaderData> {
  const instance = await requireOwnedInstance(instanceId);
  const [[bot], subscription] = await Promise.all([
    db.select().from(tables.catalogBots).where(eq(tables.catalogBots.slug, instance.catalogBotSlug)),
    getActiveSubscriptionForInstance(instanceId),
  ]);
  return { instance, bot, subscription };
}

/**
 * Dashboard start/stop switch (docs/decisions.md, 2026-07-21): a subscription
 * only entitles the bot to run, it never starts it — the customer flips this
 * explicitly, both right after checkout and any time after. Requires an
 * entitled subscription (trialing/active/past_due, same set
 * getActiveSubscriptionForInstance already filters to) — if that's exactly
 * what makes the row come back, entitlement is "running" by construction, so
 * the final desired_state is purely the switch being set here. Reports
 * inline via `useActionState` rather than a redirect (docs/decisions.md,
 * 2026-07-24, "instance store") — a redirect would blow away the whole
 * store, not just reset one tab.
 */
export async function setBotRunning(instanceId: string): Promise<ConfigActionState> {
  const instance = await requireOwnedInstance(instanceId);

  const subscription = await getActiveSubscriptionForInstance(instanceId);
  if (!subscription) return { ok: false, error: "not_subscribed" };

  // A toggle, not a client-supplied desired state — the server decides the
  // new value from whatever's currently in the row, so a stale client-side
  // read of `userEnabled` can never submit the wrong direction.
  const running = !instance.userEnabled;

  await db
    .update(tables.botInstances)
    .set({ userEnabled: running, desiredState: running ? "running" : "stopped" })
    .where(eq(tables.botInstances.id, instanceId));

  await db.insert(tables.instanceEvents).values({
    botInstanceId: instanceId,
    kind: running ? "bot_started" : "bot_stopped",
    data: {},
  });

  return { ok: true };
}

export interface BotDangerZoneInfo {
  isSubscribed: boolean;
  botName: string;
}

/**
 * Query half of the Status → Danger zone card — its own component
 * (bot-danger-zone.tsx) fetches this itself via useBotDangerZone rather than
 * being handed `isSubscribed`/`botName` down from the page's own
 * server-rendered props. `deleteInstance`/`openBillingPortal` themselves
 * stay plain redirect-based actions (imported and bound directly in the
 * component, not routed through this hook) — deleting an instance's success
 * path has to navigate away (the page it's on stops existing), and opening
 * the Stripe billing portal always redirects externally, so neither fits the
 * inline `useActionState` pattern the rest of this file uses.
 */
export async function getBotDangerZoneInfo(instanceId: string): Promise<BotDangerZoneInfo> {
  const instance = await requireOwnedInstance(instanceId);
  const [subscription, bot] = await Promise.all([
    getActiveSubscriptionForInstance(instanceId),
    db.select().from(tables.catalogBots).where(eq(tables.catalogBots.slug, instance.catalogBotSlug)),
  ]);
  return {
    isSubscribed: !!subscription,
    botName: bot[0]?.name ?? instance.catalogBotSlug,
  };
}

/**
 * Deletes the instance row outright (specs/05-security.md: "Delete instance
 * = ciphertext destroyed"). Cascades take care of instance_events,
 * greeter_visits, warden_strikes, avatar_positions; subscriptions keeps its
 * row with bot_instance_id set null (billing mirror outlives the instance).
 * Blocked while a subscription is active/trialing/past_due — billing state
 * drives entitlement (specs/02-architecture.md), so cancel that first via
 * the portal rather than deleting billing out from under the customer.
 * The running supervisor notices within one reconcile tick (~10s,
 * workers/runtime/supervisor.py) since the row it was leasing is just gone.
 */
export async function deleteInstance(instanceId: string, formData: FormData): Promise<void> {
  const instance = await requireOwnedInstance(instanceId);

  if (formData.get("confirm") !== "on") {
    await redirect(`/instances/${instanceId}?error=delete_not_confirmed`);
  }

  const subscription = await getActiveSubscriptionForInstance(instance.id);
  if (subscription) {
    await redirect(`/instances/${instanceId}?error=active_subscription`);
  }

  await db.delete(tables.botInstances).where(eq(tables.botInstances.id, instance.id));

  await redirect("/dashboard?deleted=1");
}

/**
 * Default-outfit picker's search column, called directly from the client
 * component (not a form submission — this returns data instead of
 * redirecting). Not instance-scoped, since the item catalog is global; the
 * auth check exists only so an anonymous visitor can't use our server as a
 * free proxy onto Highrise's public webapi.
 */
export async function searchOutfitItems(query: string): Promise<OutfitItemInfo[]> {
  const session = await auth();
  if (!session?.user) return [];
  return searchOutfitItemsRemote(query);
}

/**
 * Notifications card's email toggle (account-wide, see schema.ts's comment
 * on users.emailAlertsEnabled) — gates the degraded-alert cron's send
 * (db/instance-alerts.ts), not any transactional email like sign-in or
 * payment-failed. Reports inline via `useActionState` rather than a redirect
 * (docs/decisions.md, 2026-07-24, "instance store") — a redirect would blow
 * away the whole store, not just reset one tab. The card already knows the
 * value it just submitted, so no refetch is needed on success (same
 * optimistic-update reasoning `setBrowserAlertsEnabled`, right below, has
 * always used).
 */
export async function updateEmailAlerts(
  instanceId: string,
  _prevState: ConfigActionState | null,
  formData: FormData,
): Promise<ConfigActionState> {
  await requireOwnedInstance(instanceId);
  const session = await auth();

  await db
    .update(tables.users)
    .set({ emailAlertsEnabled: formData.get("enabled") === "on" })
    .where(eq(tables.users.id, session!.user.id));

  return { ok: true };
}

/**
 * Notifications card's browser toggle. Called directly from the client
 * component after (or instead of) a Notification.requestPermission() call —
 * not a form submission, since the interesting state (the browser's own
 * permission grant) never touches the server at all.
 */
export async function setBrowserAlertsEnabled(instanceId: string, enabled: boolean): Promise<void> {
  await requireOwnedInstance(instanceId);
  const session = await auth();

  await db
    .update(tables.users)
    .set({ browserAlertsEnabled: enabled })
    .where(eq(tables.users.id, session!.user.id));
}

/**
 * Lightweight status poll for the notifications card's in-page alerting —
 * fires a browser Notification when this comes back changed while the tab
 * is open. Returns data instead of redirecting, same shape as
 * searchOutfitItems above.
 */
export async function getInstanceStatus(
  instanceId: string,
): Promise<{ status: (typeof tables.botInstances.$inferSelect)["status"]; errorKind: (typeof tables.botInstances.$inferSelect)["errorKind"] } | null> {
  const session = await auth();
  if (!session?.user) return null;
  const instance = await getOwnedInstance(session.user.id, instanceId);
  if (!instance) return null;
  return { status: instance.status, errorKind: instance.errorKind };
}
