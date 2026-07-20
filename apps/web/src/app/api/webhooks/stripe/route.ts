/**
 * Stripe webhook handler (specs/03-billing.md).
 *
 * Division of responsibility across event types:
 * - checkout.session.completed: links the purchase to its bot_instance
 *   (via client_reference_id) and captures the Stripe Customer id onto the
 *   user row. Flips desired_state to "running" — this is the one place a
 *   *new* purchase turns a bot on.
 * - customer.subscription.{created,updated,deleted}: the authoritative
 *   state-machine driver. Every Stripe-side status transition (trial
 *   ending, renewal failing, retries exhausting, cancellation, recovery)
 *   fires one of these, so this is the single place mapSubscriptionStatus()
 *   gets applied and desired_state gets flipped afterward.
 * - invoice.paid / invoice.payment_failed: audit trail + future email hook
 *   (no transactional email provider chosen yet — specs/06-auth.md open
 *   question) — refreshes stripeStatus but does not independently decide
 *   desired_state, to keep exactly one source of truth for that decision.
 *
 * This handler never writes bot_instances.status — that column is
 * supervisor-observed, not billing-owned (specs/02-architecture.md).
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { mapSubscriptionStatus } from "@/lib/billing-state";
import { db, tables } from "@/db";

export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // Idempotency: Stripe delivers at-least-once. Event id as PK means a
  // second delivery no-ops here and we still return 200 (never processing
  // twice, never leaving Stripe retrying forever).
  const [inserted] = await db
    .insert(tables.webhookEvents)
    .values({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> })
    .onConflictDoNothing()
    .returning({ id: tables.webhookEvents.id });

  if (!inserted) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleEvent(event);
    await db
      .update(tables.webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(tables.webhookEvents.id, event.id));
  } catch (err) {
    // processedAt stays null — visible from webhook_events as "received but
    // not handled" for ops to investigate. Still 200: retrying the same
    // malformed event won't fix a bug in our handler, and Stripe would
    // otherwise hammer this endpoint for days.
    console.error(`[stripe webhook] handler failed for ${event.id} (${event.type})`, err);
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await onSubscriptionChanged(event.data.object as Stripe.Subscription);
      return;
    case "invoice.paid":
    case "invoice.payment_failed":
      await onInvoiceEvent(event.type, event.data.object as Stripe.Invoice);
      return;
    default:
      return; // not one of the events we act on
  }
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "subscription") return;
  const instanceId = session.client_reference_id;
  if (!instanceId) return;

  const [instance] = await db.select().from(tables.botInstances).where(eq(tables.botInstances.id, instanceId));
  if (!instance) return;

  await db
    .update(tables.botInstances)
    .set({ desiredState: "running" })
    .where(eq(tables.botInstances.id, instanceId));

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (customerId) {
    await db.update(tables.users).set({ stripeCustomerId: customerId }).where(eq(tables.users.id, instance.userId));
  }

  await db.insert(tables.instanceEvents).values({
    botInstanceId: instanceId,
    kind: "checkout_completed",
    data: { stripeCheckoutSessionId: session.id },
  });
}

async function onSubscriptionChanged(subscription: Stripe.Subscription): Promise<void> {
  const instanceId = subscription.metadata.bot_instance_id;
  const userId = subscription.metadata.user_id;
  if (!instanceId || !userId) return; // not one of our subscriptions

  const { status, desiredState } = mapSubscriptionStatus(subscription.status);
  const priceId = subscription.items.data[0]?.price.id ?? "";
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

  await db
    .insert(tables.subscriptions)
    .values({
      userId,
      botInstanceId: instanceId,
      stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      status,
      stripeStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    })
    .onConflictDoUpdate({
      target: tables.subscriptions.stripeSubscriptionId,
      set: {
        status,
        stripeStatus: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      },
    });

  await db.update(tables.botInstances).set({ desiredState }).where(eq(tables.botInstances.id, instanceId));

  // First trial actually granted for this room+token: register it so it
  // can't be reused (specs/06-auth.md). Written here, not at checkout-
  // session creation, so an abandoned checkout never burns eligibility.
  if (status === "trialing") {
    const [instance] = await db.select().from(tables.botInstances).where(eq(tables.botInstances.id, instanceId));
    if (instance?.tokenFingerprint) {
      await db
        .insert(tables.trialRegistry)
        .values({ roomId: instance.roomId, tokenFingerprint: instance.tokenFingerprint })
        .onConflictDoNothing();
    }
  }

  await db.insert(tables.instanceEvents).values({
    botInstanceId: instanceId,
    kind: "subscription_updated",
    data: { status, stripeStatus: subscription.status },
  });
}

async function onInvoiceEvent(
  type: "invoice.paid" | "invoice.payment_failed",
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId = invoice.parent?.subscription_details?.subscription;
  const stripeSubscriptionId = typeof subscriptionId === "string" ? subscriptionId : subscriptionId?.id;
  if (!stripeSubscriptionId) return;

  const [sub] = await db
    .select()
    .from(tables.subscriptions)
    .where(eq(tables.subscriptions.stripeSubscriptionId, stripeSubscriptionId));
  if (!sub) return;

  // Audit trail only — customer.subscription.updated is the sole writer of
  // subscriptions.status/stripeStatus (see file header). Don't duplicate
  // that decision here.
  await db.insert(tables.instanceEvents).values({
    botInstanceId: sub.botInstanceId!,
    kind: type === "invoice.paid" ? "invoice_paid" : "invoice_payment_failed",
    data: { invoiceId: invoice.id },
  });
}
