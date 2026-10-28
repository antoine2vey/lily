-- migrate:no-transaction
-- A failed concurrent build leaves an INVALID index that IF NOT EXISTS would
-- keep, so drop one before building.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'canopy_members_canopy_id_idx' AND NOT i.indisvalid
  ) THEN
    DROP INDEX canopy_members_canopy_id_idx;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'notifications_pending_plant_type_idx' AND NOT i.indisvalid
  ) THEN
    DROP INDEX notifications_pending_plant_type_idx;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "canopy_members_canopy_id_idx"
  ON "canopy_members" USING btree ("canopy_id");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_pending_plant_type_idx"
  ON "notifications" USING btree ("plant_id", "type")
  WHERE "status" = 'pending';
