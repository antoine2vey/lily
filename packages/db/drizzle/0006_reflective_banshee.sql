CREATE TABLE "plant_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "history_view_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plant_scans" ADD CONSTRAINT "plant_scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;