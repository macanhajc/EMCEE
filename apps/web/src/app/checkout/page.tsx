import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, tables } from "@/db";
import { getOwnedInstance } from "@/db/instances";
import { getActiveSubscriptionForInstance } from "@/db/billing";
import { startCheckout } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  bad_plan: "Pick a plan.",
  unavailable: "This bot isn't available for purchase yet.",
  stripe_error: "Something went wrong starting checkout — try again.",
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ instance?: string; error?: string }>;
}) {
  const { instance: instanceId, error } = await searchParams;
  if (!instanceId) redirect("/dashboard");

  const session = await auth(); // proxy.ts guarantees auth + age attestation on this route
  const instance = await getOwnedInstance(session!.user.id, instanceId);
  if (!instance) redirect("/dashboard");

  const existing = await getActiveSubscriptionForInstance(instanceId);
  if (existing) redirect(`/instances/${instanceId}`); // already subscribed — nothing to do here

  const [bot] = await db
    .select()
    .from(tables.catalogBots)
    .where(eq(tables.catalogBots.slug, instance.catalogBotSlug));

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", display: "grid", gap: 16 }}>
      <h1>Subscribe: {bot?.name ?? instance.catalogBotSlug}</h1>
      <p>Room: {instance.roomId}</p>
      {error && <p role="alert">{ERROR_MESSAGES[error] ?? "Something went wrong."}</p>}

      <form action={startCheckout.bind(null, instance.id)} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "block" }}>
          <input type="radio" name="plan" value="monthly" defaultChecked required /> Monthly — R$39/mo
        </label>
        <label style={{ display: "block" }}>
          <input type="radio" name="plan" value="annual" required /> Annual — R$390/yr (2 months free)
        </label>
        <p style={{ fontSize: 12, opacity: 0.6 }}>
          7-day free trial (card or Pix required up front). Cancel anytime.
        </p>
        <button type="submit">Continue to payment</button>
      </form>
    </main>
  );
}
