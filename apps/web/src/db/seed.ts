/** Idempotent dev/prod seed: the catalog itself. Run: pnpm --filter web seed */
import { db, tables } from "./index";

async function main() {
  await db
    .insert(tables.catalogBots)
    .values({
      slug: "emote",
      name: "Emcee",
      tagline: "Every emote in the game, for everyone in your room.",
      schemaVersion: 1,
      lifecycle: "beta",
      // Price ids are per-Stripe-account (test sandbox vs. live), so they
      // come from env, not a hardcoded value — see .env.example.
      stripeMonthlyPriceId: process.env.STRIPE_EMOTE_MONTHLY_PRICE_ID,
      stripeAnnualPriceId: process.env.STRIPE_EMOTE_ANNUAL_PRICE_ID,
    })
    .onConflictDoUpdate({
      target: tables.catalogBots.slug,
      set: {
        name: "Emcee",
        tagline: "Every emote in the game, for everyone in your room.",
        stripeMonthlyPriceId: process.env.STRIPE_EMOTE_MONTHLY_PRICE_ID,
        stripeAnnualPriceId: process.env.STRIPE_EMOTE_ANNUAL_PRICE_ID,
      },
    });
  console.log("seeded catalog_bots: emote");
  process.exit(0);
}

main();
