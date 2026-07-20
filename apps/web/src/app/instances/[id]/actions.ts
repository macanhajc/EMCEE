"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import emoteSchemaV1 from "@botmarket/schemas/emote/v1";
import { auth } from "@/auth";
import { db, tables } from "@/db";
import { getOwnedInstance } from "@/db/instances";
import { parseConfigFormData, sectionsFromSchema } from "@/lib/schema-form";
import { validateConfig } from "@/lib/schema-validate";
import { publishConfigUpdated } from "@/lib/redis";
import { sealToken, TokenFormatError, type SealedToken } from "@/lib/token-seal";
import { tokenEntryLimiter } from "@/lib/rate-limit";

const SCHEMAS: Record<string, object> = { emote: emoteSchemaV1 };

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
