-- "delivery_claim" names the dequeue that holds a notification row, and
-- "push_started_at" says a consumer began its push, so no other dequeue of
-- the message pushes it. "alerted_at" says the alert of a dead letter went
-- out, and the unique index keeps a message to one dead letter. The index
-- build fails, and rolls this file back, when two rows already share a
-- message id. Find them first with:
--   SELECT original_message_id, count(*) FROM dead_letter_messages
--   WHERE original_message_id <> 'unknown' AND topic <> 'enrichment.chunk_failed'
--   GROUP BY original_message_id HAVING count(*) > 1;
-- Every dead letter written before this file was alerted when it was
-- written, so each one starts with its alert recorded.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "delivery_claim" text,
  ADD COLUMN IF NOT EXISTS "push_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "dead_letter_messages" ADD COLUMN IF NOT EXISTS "alerted_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "dead_letter_messages" SET "alerted_at" = "failed_at" WHERE "alerted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dead_letter_messages_message_unique"
  ON "dead_letter_messages" USING btree ("original_message_id")
  WHERE "original_message_id" <> 'unknown' AND "topic" <> 'enrichment.chunk_failed';
