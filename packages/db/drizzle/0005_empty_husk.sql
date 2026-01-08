CREATE TYPE "public"."notification_status" AS ENUM('pending', 'queued', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "dead_letter_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_message_id" text NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text NOT NULL,
	"retry_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"failed_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid,
	"plant_id" uuid
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "status" "notification_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "dead_letter_messages" ADD CONSTRAINT "dead_letter_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_letter_messages" ADD CONSTRAINT "dead_letter_messages_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE set null ON UPDATE no action;