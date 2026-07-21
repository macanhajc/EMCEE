CREATE TABLE "greeter_visits" (
	"bot_instance_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"visit_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "greeter_visits_bot_instance_id_user_id_pk" PRIMARY KEY("bot_instance_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "greeter_visits" ADD CONSTRAINT "greeter_visits_bot_instance_id_bot_instances_id_fk" FOREIGN KEY ("bot_instance_id") REFERENCES "public"."bot_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "greeter_visits_instance_last_seen_idx" ON "greeter_visits" USING btree ("bot_instance_id","last_seen_at" DESC NULLS LAST);