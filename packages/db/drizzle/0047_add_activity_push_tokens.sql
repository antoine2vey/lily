CREATE TYPE "public"."activity_token_kind" AS ENUM('start', 'update');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('active', 'ended', 'expired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_token_id" uuid NOT NULL,
	"kind" "activity_token_kind" NOT NULL,
	"activity_id" varchar(64),
	"token" text NOT NULL,
	"status" "activity_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_push_tokens" ADD CONSTRAINT "activity_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_push_tokens" ADD CONSTRAINT "activity_push_tokens_device_token_id_device_tokens_id_fk" FOREIGN KEY ("device_token_id") REFERENCES "public"."device_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_push_tokens_user_status_idx" ON "activity_push_tokens" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_push_tokens_activity_id_idx" ON "activity_push_tokens" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_push_tokens_device_start_idx" ON "activity_push_tokens" USING btree ("device_token_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_push_tokens_active_updates_idx" ON "activity_push_tokens" USING btree ("kind","status") WHERE "status" = 'active';--> statement-breakpoint
ALTER TABLE "activity_push_tokens" ADD CONSTRAINT "activity_push_tokens_kind_activity_id_check" CHECK ((kind = 'start' AND activity_id IS NULL) OR (kind = 'update' AND activity_id IS NOT NULL));
