import { describe, expect, it } from "vitest";
import { buildCheckoutSessionParams, priceIdForPlan } from "./billing-checkout";

const bot = {
  stripeMonthlyPriceId: "price_monthly_123",
  stripeAnnualPriceId: "price_annual_456",
  stripeLifetimePriceId: "price_lifetime_789",
};

describe("priceIdForPlan", () => {
  it("picks the monthly price for plan 'monthly'", () => {
    expect(priceIdForPlan(bot, "monthly")).toBe("price_monthly_123");
  });

  it("picks the annual price for plan 'annual'", () => {
    expect(priceIdForPlan(bot, "annual")).toBe("price_annual_456");
  });

  it("picks the lifetime price for plan 'lifetime'", () => {
    expect(priceIdForPlan(bot, "lifetime")).toBe("price_lifetime_789");
  });

  it("returns null if the catalog bot has no price configured yet", () => {
    expect(
      priceIdForPlan({ stripeMonthlyPriceId: null, stripeAnnualPriceId: null, stripeLifetimePriceId: null }, "monthly"),
    ).toBeNull();
  });
});

describe("buildCheckoutSessionParams", () => {
  const base = {
    instanceId: "inst-1",
    userId: "user-1",
    userEmail: "founder@botmarket.app",
    existingStripeCustomerId: null,
    plan: "monthly" as const,
    priceId: "price_monthly_123",
    origin: "https://botmarket.app",
  };

  it("is a subscription-mode session with the given price and quantity 1", () => {
    const params = buildCheckoutSessionParams(base);
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([{ price: "price_monthly_123", quantity: 1 }]);
  });

  it("sets client_reference_id to the instance id for webhook correlation", () => {
    expect(buildCheckoutSessionParams(base).client_reference_id).toBe("inst-1");
  });

  it("never sends trial_period_days (no free trial)", () => {
    expect(buildCheckoutSessionParams(base).subscription_data).not.toHaveProperty("trial_period_days");
  });

  it("carries bot_instance_id and user_id on subscription metadata", () => {
    const params = buildCheckoutSessionParams(base);
    expect(params.subscription_data?.metadata).toEqual({ bot_instance_id: "inst-1", user_id: "user-1" });
  });

  it("uses customer_email for a first-time buyer with no Stripe customer yet", () => {
    const params = buildCheckoutSessionParams({ ...base, existingStripeCustomerId: null });
    expect(params.customer_email).toBe("founder@botmarket.app");
    expect(params.customer).toBeUndefined();
  });

  it("reuses the existing Stripe customer id for a repeat buyer instead of customer_email", () => {
    const params = buildCheckoutSessionParams({ ...base, existingStripeCustomerId: "cus_existing123" });
    expect(params.customer).toBe("cus_existing123");
    expect(params.customer_email).toBeUndefined();
  });

  it("points success_url at the instance page and cancel_url back at checkout", () => {
    const params = buildCheckoutSessionParams(base);
    expect(params.success_url).toBe("https://botmarket.app/instances/inst-1?checkout=success");
    expect(params.cancel_url).toBe("https://botmarket.app/checkout?instance=inst-1");
  });

  it("never sends payment_method_types (best practice: let Stripe determine eligible methods)", () => {
    expect(buildCheckoutSessionParams(base)).not.toHaveProperty("payment_method_types");
  });

  it("never enables automatic_tax (no active Stripe Tax registration yet)", () => {
    expect(buildCheckoutSessionParams(base)).not.toHaveProperty("automatic_tax");
  });
});

describe("buildCheckoutSessionParams (lifetime plan)", () => {
  const lifetimeBase = {
    instanceId: "inst-1",
    userId: "user-1",
    userEmail: "founder@botmarket.app",
    existingStripeCustomerId: null,
    plan: "lifetime" as const,
    priceId: "price_lifetime_789",
    origin: "https://botmarket.app",
  };

  it("is a payment-mode session, not subscription-mode", () => {
    expect(buildCheckoutSessionParams(lifetimeBase).mode).toBe("payment");
  });

  it("carries metadata on payment_intent_data instead of subscription_data", () => {
    const params = buildCheckoutSessionParams(lifetimeBase);
    expect(params.payment_intent_data?.metadata).toEqual({ bot_instance_id: "inst-1", user_id: "user-1" });
    expect(params.subscription_data).toBeUndefined();
  });

  it("forces customer_creation when there's no existing Stripe customer yet", () => {
    const params = buildCheckoutSessionParams(lifetimeBase);
    expect(params.customer_creation).toBe("always");
    expect(params.customer_email).toBe("founder@botmarket.app");
  });

  it("never sends customer_creation alongside an existing customer id", () => {
    const params = buildCheckoutSessionParams({ ...lifetimeBase, existingStripeCustomerId: "cus_existing123" });
    expect(params.customer).toBe("cus_existing123");
    expect(params.customer_creation).toBeUndefined();
  });

  it("still sets client_reference_id for webhook correlation", () => {
    expect(buildCheckoutSessionParams(lifetimeBase).client_reference_id).toBe("inst-1");
  });
});
