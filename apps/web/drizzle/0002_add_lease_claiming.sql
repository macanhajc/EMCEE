DROP INDEX "bot_instances_claim_idx";--> statement-breakpoint
ALTER TABLE "bot_instances" ADD COLUMN "supervisor_id" text;--> statement-breakpoint
ALTER TABLE "bot_instances" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "bot_instances_claim_idx" ON "bot_instances" USING btree ("desired_state","lease_expires_at");