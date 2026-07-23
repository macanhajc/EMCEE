CREATE TABLE "instance_event_rollups" (
	"bot_instance_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "instance_event_rollups_bot_instance_id_day_kind_pk" PRIMARY KEY("bot_instance_id","day","kind")
);
--> statement-breakpoint
ALTER TABLE "instance_event_rollups" ADD CONSTRAINT "instance_event_rollups_bot_instance_id_bot_instances_id_fk" FOREIGN KEY ("bot_instance_id") REFERENCES "public"."bot_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instance_events_kind_time_idx" ON "instance_events" USING btree ("kind","created_at" DESC NULLS LAST);