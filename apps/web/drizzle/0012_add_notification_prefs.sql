ALTER TABLE "users" ADD COLUMN "email_alerts_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "browser_alerts_enabled" boolean DEFAULT false NOT NULL;