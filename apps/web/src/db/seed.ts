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
    })
    .onConflictDoUpdate({
      target: tables.catalogBots.slug,
      set: { name: "Emcee", tagline: "Every emote in the game, for everyone in your room." },
    });
  console.log("seeded catalog_bots: emote");
  process.exit(0);
}

main();
