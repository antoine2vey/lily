-- migrate:no-transaction
-- A user gets at most one daily tip per local day. The scheduler now stores
-- that day in occasion_day and inserts ON CONFLICT DO NOTHING, so a second
-- api process ticking at once records nothing. Tips recorded before this
-- file have no occasion_day, so the index leaves them out: the build cannot
-- meet a duplicate, and this file writes and deletes no row.
-- A failed concurrent build leaves an INVALID index that IF NOT EXISTS would
-- keep, so drop one before building.
SET lock_timeout = '5s';
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'notifications_daily_tip_day_unique' AND NOT i.indisvalid
  ) THEN
    DROP INDEX notifications_daily_tip_day_unique;
  END IF;
END $$;
--> statement-breakpoint
RESET lock_timeout;
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "notifications_daily_tip_day_unique"
  ON "notifications" USING btree ("user_id", "occasion_day")
  WHERE "type" = 'daily_tip' AND "occasion_day" IS NOT NULL;
