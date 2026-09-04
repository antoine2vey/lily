-- Start-token rows only: timestamp of the last push-to-start dispatched to the
-- device. The notification worker enforces a short cooldown on it so a retry
-- or an adjacent scheduler poll cannot create two identical Live Activities
-- before the device has registered its update token.
ALTER TABLE "activity_push_tokens" ADD COLUMN IF NOT EXISTS "last_start_sent_at" timestamp with time zone;
