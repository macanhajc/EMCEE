/**
 * Builds the Checkout Session request — kept separate from the actual
 * `stripe.checkout.sessions.create()` call so the shape of what we send
 * Stripe is unit-testable without hitting a live API.
 */
import "server-only";
import type Stripe from "stripe";

export type Plan = "monthly" | "annual" | "lifetime";

export function priceIdForPlan(
  bot: {
    stripeMonthlyPriceId: string | null;
    stripeAnnualPriceId: string | null;
    stripeLifetimePriceId: string | null;
  },
  plan: Plan,
): string | null {
  switch (plan) {
    case "monthly":
      return bot.stripeMonthlyPriceId;
    case "annual":
      return bot.stripeAnnualPriceId;
    case "lifetime":
      return bot.stripeLifetimePriceId;
  }
}

export interface BuildCheckoutSessionInput {
  instanceId: string;
  userId: string;
  userEmail: string;
  existingStripeCustomerId: string | null;
  plan: Plan;
  priceId: string;
  origin: string;
}

export function buildCheckoutSessionParams(
  input: BuildCheckoutSessionInput,
): Stripe.Checkout.SessionCreateParams {
  // "Lifetime" is a one-time Price, not a recurring one — mode:"payment"
  // instead of mode:"subscription". Everything else (client_reference_id,
  // success/cancel URLs) stays the same shape so the webhook and the rest
  // of checkout don't need to branch on plan beyond this.
  const isLifetime = input.plan === "lifetime";
  return {
    mode: isLifetime ? "payment" : "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
    // Correlates the webhook's checkout.session.completed back to the
    // instance without a round trip.
    client_reference_id: input.instanceId,
    ...(input.existingStripeCustomerId
      ? { customer: input.existingStripeCustomerId }
      : {
          customer_email: input.userEmail,
          // mode:"payment" sessions don't create a Customer object by
          // default (Stripe's own default is "if_required") — force one so
          // a first-time lifetime buyer still gets stripeCustomerId
          // captured onto their user row, same as subscription mode always
          // has. Only valid (and only needed) when no customer id is
          // already being passed above.
          ...(isLifetime ? { customer_creation: "always" as const } : {}),
        }),
    ...(isLifetime
      ? {
          // Carried onto the PaymentIntent, since one-time payments have no
          // Subscription object for customer.subscription.* events to key
          // off of the way subscription_data.metadata does below.
          payment_intent_data: { metadata: { bot_instance_id: input.instanceId, user_id: input.userId } },
        }
      : {
          subscription_data: {
            // Carried onto the Subscription object itself, so
            // customer.subscription.* events can be correlated too — those
            // don't carry client_reference_id.
            metadata: { bot_instance_id: input.instanceId, user_id: input.userId },
          },
        }),
    success_url: `${input.origin}/instances/${input.instanceId}?checkout=success`,
    cancel_url: `${input.origin}/checkout?instance=${input.instanceId}`,
    // No automatic_tax: no active Stripe Tax registration yet (CNPJ/contador
    // blocker, specs/03-billing.md) — enabling it without one means Stripe
    // silently collects zero tax while looking configured.
    // No payment_method_types: let Stripe determine eligible methods
    // (cards, Pix) dynamically from the Dashboard rather than hardcoding.
  };
}
