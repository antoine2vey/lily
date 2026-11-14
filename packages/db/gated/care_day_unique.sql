-- GATED: the migrator applies packages/db/drizzle only, so this file does
-- nothing where it is. It deletes data. Move it into packages/db/drizzle as
-- the next numbered migration only once the duplicate count has been read on
-- production and accepted, and ship it with the care store change that sets
-- care_day on every insert path (seed scripts included).
--
-- One care per plant, care type and care day. Same-day duplicates keep the
-- earliest log; a care-plan step pointing at a removed log moves to the kept
-- one.

UPDATE "care_logs" cl
SET "care_day" = (cl."date" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date
FROM "plants" p
LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
LEFT JOIN "users" u ON u."id" = p."user_id"
LEFT JOIN pg_timezone_names ctz ON ctz."name" = c."timezone"
LEFT JOIN pg_timezone_names utz ON utz."name" = u."timezone"
WHERE p."id" = cl."plant_id" AND cl."care_day" IS NULL;
--> statement-breakpoint
CREATE TEMPORARY TABLE "care_log_duplicates" ON COMMIT DROP AS
SELECT "id", "kept_id"
FROM (
  SELECT
    "id",
    first_value("id") OVER same_day AS "kept_id",
    row_number() OVER same_day AS "position"
  FROM "care_logs"
  WINDOW same_day AS (
    PARTITION BY "plant_id", "type", "care_day"
    ORDER BY "date", "created_at", "id"
  )
) ranked
WHERE "position" > 1;
--> statement-breakpoint
UPDATE "care_plan_steps" s
SET "care_log_id" = d."kept_id"
FROM "care_log_duplicates" d
WHERE s."care_log_id" = d."id";
--> statement-breakpoint
DELETE FROM "care_logs" cl
USING "care_log_duplicates" d
WHERE cl."id" = d."id";
--> statement-breakpoint
ALTER TABLE "care_logs" ALTER COLUMN "care_day" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "care_logs_one_per_care_day"
  ON "care_logs" ("plant_id", "type", "care_day");
