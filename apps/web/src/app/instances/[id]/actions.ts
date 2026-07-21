"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import emceeSchemaV1 from "@botmarket/schemas/emcee/v1";
import { auth } from "@/auth";
import { db, tables } from "@/db";
import { getActiveSubscriptionForInstance } from "@/db/billing";
import { getOwnedInstance } from "@/db/instances";
import { parseConfigFormData, sectionsFromSchema } from "@/lib/schema-form";
import { validateConfig } from "@/lib/schema-validate";
import { publishAvatarPositionUpdated, publishConfigUpdated } from "@/lib/redis";
import { sealToken, TokenFormatError, type SealedToken } from "@/lib/token-seal";
import { tokenEntryLimiter } from "@/lib/rate-limit";
import { setAvatarPosition } from "@/db/avatar-positions";
import {
  searchOutfitItems as searchOutfitItemsRemote,
  type OutfitItemInfo,
} from "@/lib/highrise-webapi";

// Facing literal from the SDK (see apps/web/src/db/schema.ts's avatarPositions
// comment) — the only four values Highrise's own Position model accepts.
const VALID_FACINGS = new Set(["FrontRight", "FrontLeft", "BackRight", "BackLeft"]);

const SCHEMAS: Record<string, object> = { emcee: emceeSchemaV1 };

async function requireOwnedInstance(instanceId: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const instance = await getOwnedInstance(session.user.id, instanceId);
  if (!instance) redirect("/dashboard");
  return instance;
}

export async function updateConfig(instanceId: string, formData: FormData): Promise<void> {
  const instance = await requireOwnedInstance(instanceId);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const sections = sectionsFromSchema(schema);
  const config = parseConfigFormData(sections, formData);

  const { valid, errors } = validateConfig(schema, config);
  if (!valid) {
    redirect(`/instances/${instanceId}?error=${encodeURIComponent(errors[0] ?? "invalid_config")}`);
  }

  await db.update(tables.botInstances).set({ config }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  redirect(`/instances/${instanceId}?saved=1`);
}

function parseCoordinate(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * The Avatar module's "set from the dashboard" path (specs/bots/avatar.md)
 * — an alternative to saying "anchor" in-game. Writes straight to
 * `avatar_positions` (never `bot_instances.config` — coordinates are
 * deliberately kept out of the JSON config, same as the in-game path) and
 * wakes the running instance over a dedicated Redis channel so it
 * re-teleports live, no reconnect needed.
 */
export async function updateAvatarPosition(instanceId: string, formData: FormData): Promise<void> {
  await requireOwnedInstance(instanceId);

  const x = parseCoordinate(formData.get("x"));
  const y = parseCoordinate(formData.get("y"));
  const z = parseCoordinate(formData.get("z"));
  const facing = String(formData.get("facing") ?? "");

  if (x === null || y === null || z === null || !VALID_FACINGS.has(facing)) {
    redirect(`/instances/${instanceId}?error=bad_position`);
  }

  await setAvatarPosition(instanceId, { x, y, z, facing });
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "avatar_position_updated", data: {} });
  await publishAvatarPositionUpdated(instanceId);

  redirect(`/instances/${instanceId}?saved=1`);
}

export async function replaceToken(instanceId: string, formData: FormData): Promise<void> {
  await requireOwnedInstance(instanceId);

  if (!tokenEntryLimiter.attempt(instanceId)) {
    redirect(`/instances/${instanceId}?error=rate_limited`);
  }

  const token = String(formData.get("token") ?? "");
  // See the matching comment in instances/new/actions.ts.
  let sealed!: SealedToken;
  try {
    sealed = await sealToken(token);
  } catch (err) {
    if (err instanceof TokenFormatError) redirect(`/instances/${instanceId}?error=bad_token`);
    throw err;
  }

  await db
    .update(tables.botInstances)
    .set({
      tokenCiphertext: sealed.ciphertext,
      tokenKeyRef: sealed.keyRef,
      tokenLast4: sealed.last4,
      tokenFingerprint: sealed.fingerprint,
    })
    .where(eq(tables.botInstances.id, instanceId));

  // No token value in the event payload, ever (specs/05-security.md).
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "token_replaced", data: {} });

  redirect(`/instances/${instanceId}?saved=1`);
}

/**
 * Dashboard start/stop switch (docs/decisions.md, 2026-07-21): a subscription
 * only entitles the bot to run, it never starts it — the customer flips this
 * explicitly, both right after checkout and any time after. Requires an
 * entitled subscription (trialing/active/past_due, same set
 * getActiveSubscriptionForInstance already filters to) — if that's exactly
 * what makes the row come back, entitlement is "running" by construction, so
 * the final desired_state is purely the switch being set here.
 */
export async function setBotRunning(instanceId: string, running: boolean): Promise<void> {
  await requireOwnedInstance(instanceId);

  const subscription = await getActiveSubscriptionForInstance(instanceId);
  if (!subscription) redirect(`/instances/${instanceId}?error=not_subscribed`);

  await db
    .update(tables.botInstances)
    .set({ userEnabled: running, desiredState: running ? "running" : "stopped" })
    .where(eq(tables.botInstances.id, instanceId));

  await db.insert(tables.instanceEvents).values({
    botInstanceId: instanceId,
    kind: running ? "bot_started" : "bot_stopped",
    data: {},
  });

  redirect(`/instances/${instanceId}?saved=1`);
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
    redirect(`/instances/${instanceId}?error=delete_not_confirmed`);
  }

  const subscription = await getActiveSubscriptionForInstance(instance.id);
  if (subscription) {
    redirect(`/instances/${instanceId}?error=active_subscription`);
  }

  await db.delete(tables.botInstances).where(eq(tables.botInstances.id, instance.id));

  redirect("/dashboard?deleted=1");
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
