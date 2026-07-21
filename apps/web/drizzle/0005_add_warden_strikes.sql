CREATE TABLE "warden_strikes" (
	"bot_instance_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"strikes" integer DEFAULT 0 NOT NULL,
	"last_strike_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warden_strikes_bot_instance_id_user_id_pk" PRIMARY KEY("bot_instance_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "warden_strikes" ADD CONSTRAINT "warden_strikes_bot_instance_id_bot_instances_id_fk" FOREIGN KEY ("bot_instance_id") REFERENCES "public"."bot_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warden_strikes_instance_last_strike_idx" ON "warden_strikes" USING btree ("bot_instance_id","last_strike_at" DESC NULLS LAST);