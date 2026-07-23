ALTER TABLE "trial_registry" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "trial_registry" CASCADE;--> statement-breakpoint
DROP INDEX "bot_instances_fingerprint_idx";--> statement-breakpoint
ALTER TABLE "bot_instances" DROP COLUMN "token_fingerprint";