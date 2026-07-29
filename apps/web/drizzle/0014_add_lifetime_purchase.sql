ALTER TYPE "public"."subscription_status" ADD VALUE 'lifetime';--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "stripe_subscription_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_bots" ADD COLUMN "stripe_lifetime_price_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id");