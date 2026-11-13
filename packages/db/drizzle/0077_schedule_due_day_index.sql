-- migrate:no-transaction
-- Readers prune due cares on due_day from now on, which had no index. This
-- file creates that index and nothing else: it writes no row.
-- A failed concurrent build leaves an INVALID index that IF NOT EXISTS would
-- keep, so drop one before building.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'plant_care_schedules_due_day_idx' AND NOT i.indisvalid
  ) THEN
    DROP INDEX plant_care_schedules_due_day_idx;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "plant_care_schedules_due_day_idx"
  ON "plant_care_schedules" USING btree ("due_day");
