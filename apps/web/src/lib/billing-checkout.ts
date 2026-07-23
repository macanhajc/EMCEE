/**
 * Builds the Checkout Session request — kept separate from the actual
 * `stripe.checkout.sessions.create()` call so the shape of what we send
 * Stripe is unit-testable without hitting a live API.
 */
import "server-only";
import type Stripe from "stripe";

export type Plan = "monthly" | "annual";

export function priceIdForPlan(
  bot: { stripeMonthlyPriceId: string | null; stripeAnnualPriceId: string | null },
  plan: Plan,
): string | null {
  return plan === "monthly" ? bot.stripeMonthlyPriceId : bot.stripeAnnualPriceId;
}

export interface BuildCheckoutSessionInput {
  instanceId: string;
  userId: string;
  userEmail: string;
  existingStripeCustomerId: string | null;
  priceId: string;
  origin: string;
}

export function buildCheckoutSessionParams(
  input: BuildCheckoutSessionInput,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
    // Correlates the webhook's checkout.session.completed back to the
    // instance without a round trip.
    client_reference_id: input.instanceId,
    ...(input.existingStripeCustomerId
      ? { customer: input.existingStripeCustomerId }
      : { customer_email: input.userEmail }),
    subscription_data: {
      // Carried onto the Subscription object itself, so
      // customer.subscription.* events can be correlated too — those
      // don't carry client_reference_id.
      metadata: { bot_instance_id: input.instanceId, user_id: input.userId },
    },
    success_url: `${input.origin}/instances/${input.instanceId}?checkout=success`,
    cancel_url: `${input.origin}/checkout?instance=${input.instanceId}`,
    // No automatic_tax: no active Stripe Tax registration yet (CNPJ/contador
    // blocker, specs/03-billing.md) — enabling it without one means Stripe
    // silently collects zero tax while looking configured.
    // No payment_method_types: let Stripe determine eligible methods
    // (cards, Pix) dynamically from the Dashboard rather than hardcoding.
  };
}
