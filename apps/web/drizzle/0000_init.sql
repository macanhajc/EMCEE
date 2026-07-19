CREATE TYPE "public"."catalog_lifecycle" AS ENUM('beta', 'ga', 'retired');--> statement-breakpoint
CREATE TYPE "public"."desired_state" AS ENUM('running', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."instance_error_kind" AS ENUM('token', 'permissions', 'room');--> statement-breakpoint
CREATE TYPE "public"."instance_status" AS ENUM('created', 'provisioning', 'running', 'degraded', 'stopped', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'suspended', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'admin');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "bot_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_bot_slug" text NOT NULL,
	"room_id" text NOT NULL,
	"token_ciphertext" text,
	"token_key_ref" text,
	"token_last4" varchar(4),
	"token_fingerprint" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"desired_state" "desired_state" DEFAULT 'stopped' NOT NULL,
	"status" "instance_status" DEFAULT 'created' NOT NULL,
	"error_kind" "instance_error_kind",
	"shard" text,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_bots" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"schema_version" integer NOT NULL,
	"lifecycle" "catalog_lifecycle" DEFAULT 'beta' NOT NULL,
	"stripe_monthly_price_id" text,
	"stripe_annual_price_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "instance_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bot_instance_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bot_instance_id" uuid,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"status" "subscription_status" NOT NULL,
	"stripe_status" text NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "trial_registry" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trial_registry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"room_id" text NOT NULL,
	"token_fingerprint" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"age_attested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_instances" ADD CONSTRAINT "bot_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_instances" ADD CONSTRAINT "bot_instances_catalog_bot_slug_catalog_bots_slug_fk" FOREIGN KEY ("catalog_bot_slug") REFERENCES "public"."catalog_bots"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_events" ADD CONSTRAINT "instance_events_bot_instance_id_bot_instances_id_fk" FOREIGN KEY ("bot_instance_id") REFERENCES "public"."bot_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_bot_instance_id_bot_instances_id_fk" FOREIGN KEY ("bot_instance_id") REFERENCES "public"."bot_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_instances_user_idx" ON "bot_instances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bot_instances_claim_idx" ON "bot_instances" USING btree ("shard","desired_state");--> statement-breakpoint
CREATE INDEX "bot_instances_room_idx" ON "bot_instances" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "bot_instances_fingerprint_idx" ON "bot_instances" USING btree ("token_fingerprint");--> statement-breakpoint
CREATE INDEX "instance_events_instance_time_idx" ON "instance_events" USING btree ("bot_instance_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_instance_idx" ON "subscriptions" USING btree ("bot_instance_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trial_registry_room_idx" ON "trial_registry" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "trial_registry_fingerprint_idx" ON "trial_registry" USING btree ("token_fingerprint");