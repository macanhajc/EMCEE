CREATE TYPE "public"."moderation_action" AS ENUM('ban', 'unban');--> statement-breakpoint
CREATE TYPE "public"."moderation_request_status" AS ENUM('pending', 'processing', 'applied', 'denied', 'failed');--> statement-breakpoint
CREATE TABLE "moderation_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "moderation_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"bot_instance_id" uuid NOT NULL,
	"target_user_id" text NOT NULL,
	"target_username" text NOT NULL,
	"action" "moderation_action" NOT NULL,
	"duration_s" integer,
	"requested_by" uuid NOT NULL,
	"status" "moderation_request_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "moderation_requests" ADD CONSTRAINT "moderation_requests_bot_instance_id_bot_instances_id_fk" FOREIGN KEY ("bot_instance_id") REFERENCES "public"."bot_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_requests" ADD CONSTRAINT "moderation_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_requests_instance_status_idx" ON "moderation_requests" USING btree ("bot_instance_id","status");