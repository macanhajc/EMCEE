"use server";

import { eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import emceeSchemaV1 from "@botmarket/schemas/emcee/v1";
import { auth } from "@/auth";
import { redirect } from "@/i18n/redirect";
import { db, tables } from "@/db";
import type { AppLocale } from "@/i18n/routing";
import { getGreeterTemplateDefaults } from "@/lib/greeter-template-defaults";
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

  // The schema's own `default` for welcome.templates/vip.template/
  // farewell.public_template is a single static (English) string — it has no
  // notion of dashboard locale, since it's shared with the Python runtime's
  // validation. Overriding those three fields with the creating user's
  // current locale here, once, at creation, means a new instance's greeter
  // starts in the same language its dashboard is in, without touching the
  // schema itself. See lib/greeter-template-defaults.ts.
  const config = defaultsFromSchema(schema);
  if (catalogSlug === "emcee") {
    const locale = (await getLocale()) as AppLocale;
    const localized = getGreeterTemplateDefaults(locale);
    config.welcome.templates = localized.welcomeTemplates;
    config.vip.template = localized.vipTemplate;
    config.farewell.public_template = localized.farewellPublicTemplate;
    config.activation_message.template = localized.activationMessageTemplate;
    // Unlike the four above, this isn't localized *copy* — `general.
    // bot_language` is itself one of the five locale codes, so the creating
    // user's own current locale doubles directly as a reasonable starting
    // guess for what language they want their bot replying in. Still just a
    // starting point: editable afterward from the Status tab, same as
    // everything else seeded here.
    config.general.bot_language = locale;
  }

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
      config,
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
