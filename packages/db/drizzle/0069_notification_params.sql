SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "params" jsonb;
