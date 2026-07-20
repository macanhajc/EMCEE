"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, tables } from "@/db";
import { getOwnedInstance } from "@/db/instances";
import { hasUsedTrial } from "@/db/billing";
import { buildCheckoutSessionParams, priceIdForPlan, type Plan } from "@/lib/billing-checkout";
import { stripe } from "@/lib/stripe";

export async function startCheckout(instanceId: string, formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const backTo = (error: string): never =>
    redirect(`/checkout?instance=${instanceId}&error=${error}`);

  // Defense at the point of the actual purchase action, not just the page
  // it's linked from (specs/06-auth.md: "purchase requires 18+ attestation").
  if (!session.user.ageAttestedAt) {
    redirect(`/account/attest-age?next=${encodeURIComponent(`/checkout?instance=${instanceId}`)}`);
  }

  const instance = await getOwnedInstance(session.user.id, instanceId);
  if (!instance) redirect("/dashboard");

  const plan = String(formData.get("plan") ?? "");
  if (plan !== "monthly" && plan !== "annual") backTo("bad_plan");

  const [bot] = await db
    .select()
    .from(tables.catalogBots)
    .where(eq(tables.catalogBots.slug, instance.catalogBotSlug));
  if (!bot) backTo("unavailable");
  const priceId = priceIdForPlan(bot, plan as Plan);
  if (!priceId) backTo("unavailable");

  const [user] = await db.select().from(tables.users).where(eq(tables.users.id, session.user.id));

  const trialEligible = instance.tokenFingerprint
    ? !(await hasUsedTrial(instance.roomId, instance.tokenFingerprint))
    : false;

  const origin = (await headers()).get("origin") ?? process.env.APP_ORIGIN ?? "http://localhost:3000";

  const checkoutSession = await stripe.checkout.sessions.create(
    buildCheckoutSessionParams({
      instanceId: instance.id,
      userId: session.user.id,
      userEmail: session.user.email!,
      existingStripeCustomerId: user?.stripeCustomerId ?? null,
      // Non-null: narrowed above by `if (!priceId) backTo(...)`, but TS's
      // narrowing doesn't survive the intervening awaits (same limitation
      // as the sealed-token actions elsewhere in this app).
      priceId: priceId!,
      trialEligible,
      origin,
    }),
  );

  if (!checkoutSession.url) backTo("stripe_error");
  redirect(checkoutSession.url!);
}

export async function openBillingPortal(): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [user] = await db.select().from(tables.users).where(eq(tables.users.id, session.user.id));
  if (!user?.stripeCustomerId) redirect("/dashboard"); // never checked out — nothing to manage

  const origin = (await headers()).get("origin") ?? process.env.APP_ORIGIN ?? "http://localhost:3000";
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/dashboard`,
  });

  redirect(portalSession.url);
}
