CREATE TABLE "ops_alerts" (
	"kind" text PRIMARY KEY NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supervisor_heartbeats" (
	"supervisor_id" text PRIMARY KEY NOT NULL,
	"capacity" integer NOT NULL,
	"running_count" integer NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
