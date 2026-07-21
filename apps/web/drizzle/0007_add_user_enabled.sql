-- Customer-owned start/stop switch (docs/decisions.md, 2026-07-21):
-- a subscription entitles the bot to run but no longer starts it by
-- itself — desired_state becomes entitled && user_enabled (see
-- lib/billing-state.ts resolveDesiredState).
ALTER TABLE "bot_instances" ADD COLUMN "user_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill: any row already running today only got there because billing
-- already turned it on, so treat that as an implicit "on" rather than
-- silently stopping already-live bots the next time a billing event
-- recomputes desired_state.
UPDATE "bot_instances" SET "user_enabled" = true WHERE "desired_state" = 'running';
