"use server";

import { eq } from "drizzle-orm";
import emceeSchemaV1 from "@botmarket/schemas/emcee/v1";
import { auth } from "@/auth";
import { redirect } from "@/i18n/redirect";
import { db, tables } from "@/db";
import { getActiveSubscriptionForInstance } from "@/db/billing";
import { getOwnedInstance } from "@/db/instances";
import { parseConfigFormData, sectionsFromSchema } from "@/lib/schema-form";
import { validateConfig } from "@/lib/schema-validate";
import { publishAvatarPositionUpdated, publishConfigUpdated, publishModerationRequested } from "@/lib/notify";
import { normalizeRoomId } from "@/lib/room-id";
import { sealToken, TokenFormatError, type SealedToken } from "@/lib/token-seal";
import { tokenEntryLimiter } from "@/lib/rate-limit";
import { setAvatarPosition } from "@/db/avatar-positions";
import {
  getUserByUsername,
  searchOutfitItems as searchOutfitItemsRemote,
  type OutfitItemInfo,
} from "@/lib/highrise-webapi";

// Facing literal from the SDK (see apps/web/src/db/schema.ts's avatarPositions
// comment) — the only four values Highrise's own Position model accepts.
const VALID_FACINGS = new Set(["FrontRight", "FrontLeft", "BackRight", "BackLeft"]);

const SCHEMAS: Record<string, object> = { emcee: emceeSchemaV1 };

async function requireOwnedInstance(instanceId: string) {
  const session = await auth();
  if (!session?.user) await redirect("/login");
  const instance = await getOwnedInstance(session!.user.id, instanceId);
  if (!instance) await redirect("/dashboard");
  return instance;
}

export async function updateConfig(instanceId: string, formData: FormData): Promise<void> {
  const instance = await requireOwnedInstance(instanceId);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const sections = sectionsFromSchema(schema);
  const config = parseConfigFormData(sections, formData);

  const { valid, errors } = validateConfig(schema, config);
  if (!valid) {
    await redirect(`/instances/${instanceId}?error=${encodeURIComponent(errors[0] ?? "invalid_config")}`);
  }

  await db.update(tables.botInstances).set({ config }).where(eq(tables.botInstances.id, instanceId));
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "config_updated", data: {} });
  await publishConfigUpdated(instanceId);

  await redirect(`/instances/${instanceId}?saved=1`);
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
 * wakes the running instance over a dedicated Postgres NOTIFY channel so it
 * re-teleports live, no reconnect needed.
 */
export async function updateAvatarPosition(instanceId: string, formData: FormData): Promise<void> {
  await requireOwnedInstance(instanceId);

  const x = parseCoordinate(formData.get("x"));
  const y = parseCoordinate(formData.get("y"));
  const z = parseCoordinate(formData.get("z"));
  const facing = String(formData.get("facing") ?? "");

  if (x === null || y === null || z === null || !VALID_FACINGS.has(facing)) {
    await redirect(`/instances/${instanceId}?error=bad_position`);
  }

  await setAvatarPosition(instanceId, { x: x!, y: y!, z: z!, facing });
  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "avatar_position_updated", data: {} });
  await publishAvatarPositionUpdated(instanceId);

  await redirect(`/instances/${instanceId}?saved=1`);
}

export async function replaceToken(instanceId: string, formData: FormData): Promise<void> {
  await requireOwnedInstance(instanceId);

  if (!tokenEntryLimiter.attempt(instanceId)) {
    await redirect(`/instances/${instanceId}?error=rate_limited`);
  }

  const token = String(formData.get("token") ?? "");
  // See the matching comment in instances/new/actions.ts.
  let sealed!: SealedToken;
  try {
    sealed = await sealToken(token);
  } catch (err) {
    if (err instanceof TokenFormatError) await redirect(`/instances/${instanceId}?error=bad_token`);
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

  await redirect(`/instances/${instanceId}?saved=1`);
}

/**
 * Owner-initiated ban/unban from the dashboard (specs/bots/moderation.md's
 * "proposed" section) — covers both the Regulars table's per-row buttons
 * (target_user_id/target_username already known, passed as hidden fields)
 * and the manual "ban by username" form (only target_username is given; the
 * public webapi resolves it here, so a never-tracked user can still be
 * banned without the bot ever having shared a room with them). Deliberately
 * does not write `instance_events` itself — the data plane owns that write
 * once Highrise actually confirms the action, so the dashboard never shows a
 * success toast ahead of reality. No token, no WebSocket touched here; this
 * only ever inserts a pending row and wakes the supervisor.
 */
export async function requestModeration(instanceId: string, formData: FormData): Promise<void> {
  await requireOwnedInstance(instanceId);
  const session = await auth();

  const rawAction = String(formData.get("action") ?? "");
  if (rawAction !== "ban" && rawAction !== "unban") {
    await redirect(`/instances/${instanceId}?error=invalid_moderation_action`);
  }
  const action = rawAction as "ban" | "unban";

  let targetUserId = String(formData.get("target_user_id") ?? "").trim();
  let targetUsername = String(formData.get("target_username") ?? "").trim();

  if (!targetUserId) {
    if (!targetUsername) await redirect(`/instances/${instanceId}?error=missing_target`);

    const resolved = await getUserByUsername(targetUsername);
    if (!resolved) await redirect(`/instances/${instanceId}?error=user_not_found`);

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

  await redirect(`/instances/${instanceId}?saved=1`);
}

/**
 * Moves this instance to a different Highrise room — same idea as
 * replaceToken above (customer-initiated, write path only), but for
 * `room_id` instead of the ciphertext. The bot itself needs no code change
 * to pick this up: supervisor.py rereads `room_id` fresh from the row on
 * every reconnect attempt, same as it does for the token.
 */
export async function replaceRoomId(instanceId: string, formData: FormData): Promise<void> {
  await requireOwnedInstance(instanceId);

  const roomId = normalizeRoomId(String(formData.get("room_id") ?? ""));
  if (!roomId) await redirect(`/instances/${instanceId}?error=missing_room`);

  await db.update(tables.botInstances).set({ roomId }).where(eq(tables.botInstances.id, instanceId));

  await db.insert(tables.instanceEvents).values({ botInstanceId: instanceId, kind: "room_id_replaced", data: {} });

  await redirect(`/instances/${instanceId}?saved=1`);
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
  if (!subscription) await redirect(`/instances/${instanceId}?error=not_subscribed`);

  await db
    .update(tables.botInstances)
    .set({ userEnabled: running, desiredState: running ? "running" : "stopped" })
    .where(eq(tables.botInstances.id, instanceId));

  await db.insert(tables.instanceEvents).values({
    botInstanceId: instanceId,
    kind: running ? "bot_started" : "bot_stopped",
    data: {},
  });

  await redirect(`/instances/${instanceId}?saved=1`);
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
 * payment-failed.
 */
export async function updateEmailAlerts(instanceId: string, formData: FormData): Promise<void> {
  await requireOwnedInstance(instanceId);
  const session = await auth();

  await db
    .update(tables.users)
    .set({ emailAlertsEnabled: formData.get("enabled") === "on" })
    .where(eq(tables.users.id, session!.user.id));

  await redirect(`/instances/${instanceId}?saved=1`);
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
