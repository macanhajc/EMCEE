/** Idempotent dev/prod seed: the catalog itself. Run: pnpm --filter web seed */
import { db, tables } from "./index";

async function main() {
  // One row: Emcee is the one bot — Emote and Concierge are feature modules
  // within it (one instance, one token), not separate catalog products
  // (docs/decisions.md, 2026-07-20 "Emcee merge"). Slug was "emote" before
  // that merge; renamed to match, same underlying Stripe product/prices.
  await db
    .insert(tables.catalogBots)
    .values({
      slug: "emcee",
      name: "Emcee",
      tagline: "Your room's full-time host — entertains, greets, moderates, and looks the part.",
      schemaVersion: 1,
      lifecycle: "beta",
      // Price ids are per-Stripe-account (test sandbox vs. live), so they
      // come from env, not a hardcoded value — see .env.example.
      stripeMonthlyPriceId: process.env.STRIPE_EMCEE_MONTHLY_PRICE_ID,
      stripeAnnualPriceId: process.env.STRIPE_EMCEE_ANNUAL_PRICE_ID,
    })
    .onConflictDoUpdate({
      target: tables.catalogBots.slug,
      set: {
        name: "Emcee",
        tagline: "Your room's full-time host — entertains, greets, moderates, and looks the part.",
        stripeMonthlyPriceId: process.env.STRIPE_EMCEE_MONTHLY_PRICE_ID,
        stripeAnnualPriceId: process.env.STRIPE_EMCEE_ANNUAL_PRICE_ID,
      },
    });
  console.log("seeded catalog_bots: emcee");
  process.exit(0);
}

main();
