/**
 * Stripe webhook handler (specs/03-billing.md).
 *
 * Division of responsibility across event types:
 * - checkout.session.completed: links the purchase to its bot_instance
 *   (via client_reference_id) and captures the Stripe Customer id onto the
 *   user row. Deliberately does NOT flip desired_state — a fresh purchase
 *   entitles the bot to run but never starts it by itself; the customer
 *   presses Start from the dashboard (docs/decisions.md, 2026-07-21).
 * - customer.subscription.{created,updated,deleted}: the authoritative
 *   entitlement driver. Every Stripe-side status transition (trial ending,
 *   renewal failing, retries exhausting, cancellation, recovery) fires one
 *   of these, so this is the single place mapSubscriptionStatus() gets
 *   applied and desired_state gets recomputed via resolveDesiredState()
 *   (entitlement AND the customer's own user_enabled switch).
 * - invoice.paid / invoice.payment_failed: audit trail, plus (payment_failed
 *   only) a best-effort customer email via sendPaymentFailedEmail — Stripe's
 *   own Smart Retries and the past_due grace period are what actually keep
 *   the bot running, this is just the "grace before cut-off feels like a
 *   nudge, not an outage" notice (specs/03-billing.md). invoice.paid gets no
 *   confirmation email: Stripe's own receipt already covers that. Neither
 *   independently decides desired_state, to keep exactly one source of
 *   truth for that decision.
 *
 * This handler never writes bot_instances.status — that column is
 * supervisor-observed, not billing-owned (specs/02-architecture.md).
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { mapSubscriptionStatus, resolveDesiredState } from "@/lib/billing-state";
import { getSubscriptionContact } from "@/db/billing";
import { sendPaymentFailedEmail } from "@/lib/payment-failed-mailer";
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

  const { status, desiredState: entitlement } = mapSubscriptionStatus(subscription.status);
  const priceId = subscription.items.data[0]?.price.id ?? "";
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

  // Fetched once, up front: needed to gate desired_state by the customer's
  // own start/stop switch below (instance may not exist — e.g. a
  // subscription event arriving after the instance itself was deleted).
  const [instance] = await db.select().from(tables.botInstances).where(eq(tables.botInstances.id, instanceId));

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

  if (instance) {
    const desiredState = resolveDesiredState(entitlement, instance.userEnabled);
    await db.update(tables.botInstances).set({ desiredState }).where(eq(tables.botInstances.id, instanceId));
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

  if (type === "invoice.payment_failed") {
    const contact = await getSubscriptionContact(sub.botInstanceId!);
    if (contact) {
      await sendPaymentFailedEmail({
        to: contact.userEmail,
        userName: contact.userName,
        roomId: contact.roomId,
        instanceId: sub.botInstanceId!,
        appOrigin: process.env.APP_ORIGIN ?? "http://localhost:3000",
        locale: contact.userLocale,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
      });
    }
  }
}
