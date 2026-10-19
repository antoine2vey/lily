ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "queued_at" timestamp with time zone;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "delivery_message_id" text;
