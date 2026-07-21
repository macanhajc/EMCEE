-- Emcee merge (docs/decisions.md, 2026-07-20): Concierge folded into the
-- same bot/instance/token as Emote, so the catalog_bots slug "emote"
-- becomes "emcee" — one row, one purchasable product, matching every spec's
-- "one bot, several modules" framing. No schema/DDL change (slug stays a
-- plain text PK) — this is a pure data migration.
--
-- Order matters under the FK from bot_instances.catalog_bot_slug: insert
-- the new row first (additive, nothing references it yet), repoint any
-- existing instances to it, then drop the old row — the FK is satisfied at
-- every intermediate step, not just at the end.
--
-- ON CONFLICT DO UPDATE, not DO NOTHING: the Python test suite's
-- conftest.py inserts a bare-bones ('emcee', 'Emcee', schema_version=1)
-- placeholder row against this same dev DB on every run (it did the same
-- for 'emote' before this rename), so a real 'emcee' row can already exist
-- with no tagline/price ids by the time this migration runs — DO NOTHING
-- would leave that placeholder in place instead of the real data below.
INSERT INTO "catalog_bots" ("slug", "name", "tagline", "schema_version", "lifecycle", "stripe_monthly_price_id", "stripe_annual_price_id")
SELECT 'emcee', 'Emcee', 'Every emote in the game, plus a Concierge that greets your regulars by name.', "schema_version", "lifecycle", "stripe_monthly_price_id", "stripe_annual_price_id"
FROM "catalog_bots" WHERE "slug" = 'emote'
ON CONFLICT ("slug") DO UPDATE SET
  "tagline" = EXCLUDED."tagline",
  "lifecycle" = EXCLUDED."lifecycle",
  "stripe_monthly_price_id" = EXCLUDED."stripe_monthly_price_id",
  "stripe_annual_price_id" = EXCLUDED."stripe_annual_price_id";
--> statement-breakpoint
UPDATE "bot_instances" SET "catalog_bot_slug" = 'emcee' WHERE "catalog_bot_slug" = 'emote';
--> statement-breakpoint
DELETE FROM "catalog_bots" WHERE "slug" = 'emote';
