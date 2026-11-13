-- migrate:no-transaction
-- A plant answer reads the stored day of each schedule's last care from the
-- care log dated last_care_at. With plant_id alone indexed, that lookup read
-- the plant's whole care history. This file creates the index and nothing
-- else: it writes no row.
-- A failed concurrent build leaves an INVALID index that IF NOT EXISTS would
-- keep, so drop one before building.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'care_logs_plant_id_date_idx' AND NOT i.indisvalid
  ) THEN
    DROP INDEX care_logs_plant_id_date_idx;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "care_logs_plant_id_date_idx"
  ON "care_logs" USING btree ("plant_id", "date");
