ALTER TABLE "activity_push_tokens" ADD COLUMN "last_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_push_tokens" ADD COLUMN "last_failed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_push_tokens_unconfirmed_start_idx" ON "activity_push_tokens" USING btree ("kind","status","last_confirmed_at","started_at") WHERE "kind" = 'start' AND "status" = 'active';
