-- A start row remembers the activity id of the last push-to-start it sent,
-- and when the device posted the card of that start. A post of any other
-- card, such as an old card re-posted on launch, no longer confirms it. Two
-- nullable columns: the release already running never reads them. The ALTER
-- takes ACCESS EXCLUSIVE on "activity_push_tokens" for an instant, which the
-- timeout bounds.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "activity_push_tokens"
  ADD COLUMN "start_activity_id" varchar(64),
  ADD COLUMN "start_confirmed_at" timestamp with time zone;
