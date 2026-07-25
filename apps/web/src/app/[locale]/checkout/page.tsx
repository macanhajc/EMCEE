import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "@/i18n/redirect";
import { CheckoutTemplate } from "@/modules/checkout";
import { db, tables } from "@/db";
import { getActiveSubscriptionForInstance } from "@/db/billing";
import { getOwnedInstance } from "@/db/instances";
import { getEmceePrices } from "@/lib/pricing";
import { startCheckout } from "./actions";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ instance?: string; error?: string }>;
}) {
  const { instance: instanceId, error } = await searchParams;
  if (!instanceId) await redirect("/dashboard");

  const session = await auth(); // proxy.ts guarantees auth + age attestation on this route
  const instance = await getOwnedInstance(session!.user.id, instanceId!);
  if (!instance) await redirect("/dashboard");

  const existing = await getActiveSubscriptionForInstance(instanceId!);
  if (existing) await redirect(`/instances/${instanceId}`); // already subscribed — nothing to do here

  const [bot] = await db
    .select()
    .from(tables.catalogBots)
    .where(eq(tables.catalogBots.slug, instance.catalogBotSlug));

  const prices = await getEmceePrices();

  return (
    <CheckoutTemplate
      botName={bot?.name ?? instance.catalogBotSlug}
      instanceId={instance.id}
      roomId={instance.roomId}
      error={error}
      prices={prices}
      startCheckout={startCheckout.bind(null, instance.id)}
    />
  );
}
