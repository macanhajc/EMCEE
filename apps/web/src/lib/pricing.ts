/**
 * Live Emcee prices, read from Stripe instead of hardcoded (docs/decisions.md,
 * 2026-07-25) — the two Price ids (`STRIPE_EMCEE_MONTHLY_PRICE_ID`/
 * `STRIPE_EMCEE_ANNUAL_PRICE_ID`) are the actual source of truth Checkout
 * already charges against; this just reads the same objects instead of
 * duplicating their amount by hand in copy. That duplication was a real bug
 * once already (2026-07-24 entry: display copy said R$14,99 while the real
 * test-mode Price was still R$39).
 *
 * Cached (1h) via unstable_cache rather than fetched live on every request —
 * a public marketing/checkout page shouldn't pay Stripe API latency, or fail
 * to render, on every load over a value that changes essentially never.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { requireEnv, stripe } from "./stripe";

export interface PriceDisplay {
  brl: string;
  usd: string;
}

export interface EmceePrices {
  monthly: PriceDisplay;
  annual: PriceDisplay;
}

// Soft reference only — Stripe never charges in USD here (BRL-only rail,
// specs/03-billing.md); this is purely what's shown to non-pt visitors
// alongside the real BRL amount Stripe returns. Same implied rate the
// 2026-07-24 price change used (~5.55 BRL/USD) — not a committed FX rate.
const BRL_TO_USD_REFERENCE_RATE = 5.55;

// Emergency fallback only, if the live Stripe fetch fails — never the
// source of truth for what's actually charged (Checkout always uses the
// real Price id regardless of what this module returns). A mismatch here
// just means a stale-looking number for the length of one Stripe outage,
// not a wrong charge. Update by hand if the real prices change and this
// somehow still renders.
const FALLBACK_PRICES: EmceePrices = {
  monthly: { brl: "R$14,99", usd: "~US$2.70" },
  annual: { brl: "R$129,90", usd: "~US$23" },
};

function formatBrl(unitAmountCents: number): string {
  return `R$${(unitAmountCents / 100).toFixed(2).replace(".", ",")}`;
}

function formatUsdReference(unitAmountCents: number, decimals: number): string {
  const usd = unitAmountCents / 100 / BRL_TO_USD_REFERENCE_RATE;
  return `~US$${usd.toFixed(decimals)}`;
}

async function fetchEmceePrices(): Promise<EmceePrices> {
  const [monthly, annual] = await Promise.all([
    stripe.prices.retrieve(requireEnv("STRIPE_EMCEE_MONTHLY_PRICE_ID")),
    stripe.prices.retrieve(requireEnv("STRIPE_EMCEE_ANNUAL_PRICE_ID")),
  ]);
  if (monthly.unit_amount === null || annual.unit_amount === null) {
    throw new Error("Emcee price is missing unit_amount (not a flat per-unit price?)");
  }
  return {
    // Annual shown as a whole dollar (matches the original hand-written
    // copy) — purely cosmetic, this is a rough reference either way.
    monthly: { brl: formatBrl(monthly.unit_amount), usd: formatUsdReference(monthly.unit_amount, 2) },
    annual: { brl: formatBrl(annual.unit_amount), usd: formatUsdReference(annual.unit_amount, 0) },
  };
}

export const getEmceePrices = unstable_cache(
  async (): Promise<EmceePrices> => {
    try {
      return await fetchEmceePrices();
    } catch (err) {
      console.error("[pricing] live Stripe price fetch failed, using fallback", err);
      return FALLBACK_PRICES;
    }
  },
  ["emcee-prices"],
  { revalidate: 3600, tags: ["emcee-prices"] },
);
