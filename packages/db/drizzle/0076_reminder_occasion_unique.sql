-- migrate:no-transaction
-- A failed concurrent build leaves an INVALID index that IF NOT EXISTS would
-- keep, so drop one before building.
DO $$
DECLARE
  duplicate record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'notifications_occasion_unique' AND NOT i.indisvalid
  ) THEN
    DROP INDEX notifications_occasion_unique;
  END IF;
  SELECT user_id, plant_id, type, occasion_day, count(*) AS copies
    INTO duplicate
    FROM notifications
    WHERE occasion_day IS NOT NULL
    GROUP BY user_id, plant_id, type, occasion_day
    HAVING count(*) > 1
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'notifications_occasion_unique: % rows share user %, plant %, type %, occasion %',
      duplicate.copies, duplicate.user_id, duplicate.plant_id, duplicate.type, duplicate.occasion_day;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "notifications_occasion_unique"
  ON "notifications" USING btree ("user_id", "plant_id", "type", "occasion_day")
  WHERE "occasion_day" IS NOT NULL;
