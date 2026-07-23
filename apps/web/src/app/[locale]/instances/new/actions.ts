"use server";

import { eq } from "drizzle-orm";
import emceeSchemaV1 from "@botmarket/schemas/emcee/v1";
import { auth } from "@/auth";
import { redirect } from "@/i18n/redirect";
import { db, tables } from "@/db";
import { defaultsFromSchema } from "@/lib/schema-form";
import { normalizeRoomId } from "@/lib/room-id";
import { sealToken, TokenFormatError, type SealedToken } from "@/lib/token-seal";
import { tokenEntryLimiter } from "@/lib/rate-limit";

// Only catalog bot (specs: "v1: exactly one bot, not a catalog to choose
// between" — docs/decisions.md, 2026-07-20); add entries here if that ever
// changes.
const SCHEMAS: Record<string, object> = { emcee: emceeSchemaV1 };

export async function createInstance(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) await redirect("/login");

  const backToForm = (error: string): Promise<never> => redirect(`/instances/new?error=${error}`);

  if (!tokenEntryLimiter.attempt(session!.user.id)) await backToForm("rate_limited");

  const catalogSlug = String(formData.get("bot") ?? "");
  const roomId = normalizeRoomId(String(formData.get("room_id") ?? ""));
  const token = String(formData.get("token") ?? "");

  if (!roomId) await backToForm("missing_room");
  if (!token) await backToForm("missing_token");

  const schema = SCHEMAS[catalogSlug];
  if (!schema) await backToForm("unknown_bot");

  const [bot] = await db.select().from(tables.catalogBots).where(eq(tables.catalogBots.slug, catalogSlug));
  if (!bot) await backToForm("unknown_bot");

  // Definite-assignment assertion: backToForm() always throws (via
  // redirect()), so this is unreachable if sealToken() fails — TS's
  // definite-assignment checker just doesn't trust a never-typed function
  // call inside a catch block the way it trusts throw/return.
  let sealed!: SealedToken;
  try {
    sealed = await sealToken(token);
  } catch (err) {
    if (err instanceof TokenFormatError) await backToForm("bad_token");
    throw err; // our misconfiguration, not a user mistake — let it surface as a real error
  }

  const [instance] = await db
    .insert(tables.botInstances)
    .values({
      userId: session!.user.id,
      catalogBotSlug: bot.slug,
      roomId,
      tokenCiphertext: sealed.ciphertext,
      tokenKeyRef: sealed.keyRef,
      tokenLast4: sealed.last4,
      config: defaultsFromSchema(schema),
      schemaVersion: bot.schemaVersion,
      // desiredState/status left at their DB defaults (stopped/created) —
      // only billing flips desired_state (specs/02-architecture.md).
    })
    .returning({ id: tables.botInstances.id });

  await db.insert(tables.instanceEvents).values({
    botInstanceId: instance.id,
    kind: "instance_created",
    data: { catalogBotSlug: bot.slug },
  });

  await redirect(`/instances/${instance.id}`);
}
