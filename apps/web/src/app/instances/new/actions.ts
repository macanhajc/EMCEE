"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import emoteSchemaV1 from "@botmarket/schemas/emote/v1";
import { auth } from "@/auth";
import { db, tables } from "@/db";
import { defaultsFromSchema } from "@/lib/schema-form";
import { normalizeRoomId } from "@/lib/room-id";
import { sealToken, TokenFormatError, type SealedToken } from "@/lib/token-seal";
import { tokenEntryLimiter } from "@/lib/rate-limit";

// Only catalog bot today (specs: "v1 catalog focuses entirely on the Emote
// bot"); add entries here as the catalog grows past one row.
const SCHEMAS: Record<string, object> = { emote: emoteSchemaV1 };

export async function createInstance(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const backToForm = (error: string): never => redirect(`/instances/new?error=${error}`);

  if (!tokenEntryLimiter.attempt(session.user.id)) backToForm("rate_limited");

  const catalogSlug = String(formData.get("bot") ?? "");
  const roomId = normalizeRoomId(String(formData.get("room_id") ?? ""));
  const token = String(formData.get("token") ?? "");

  if (!roomId) backToForm("missing_room");
  if (!token) backToForm("missing_token");

  const schema = SCHEMAS[catalogSlug];
  if (!schema) backToForm("unknown_bot");

  const [bot] = await db.select().from(tables.catalogBots).where(eq(tables.catalogBots.slug, catalogSlug));
  if (!bot) backToForm("unknown_bot");

  // Definite-assignment assertion: backToForm() always throws (via
  // redirect()), so this is unreachable if sealToken() fails — TS's
  // definite-assignment checker just doesn't trust a never-typed function
  // call inside a catch block the way it trusts throw/return.
  let sealed!: SealedToken;
  try {
    sealed = await sealToken(token);
  } catch (err) {
    if (err instanceof TokenFormatError) backToForm("bad_token");
    throw err; // our misconfiguration, not a user mistake — let it surface as a real error
  }

  const [instance] = await db
    .insert(tables.botInstances)
    .values({
      userId: session.user.id,
      catalogBotSlug: bot.slug,
      roomId,
      tokenCiphertext: sealed.ciphertext,
      tokenKeyRef: sealed.keyRef,
      tokenLast4: sealed.last4,
      tokenFingerprint: sealed.fingerprint,
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

  redirect(`/instances/${instance.id}`);
}
