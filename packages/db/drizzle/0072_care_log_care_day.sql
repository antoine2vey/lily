-- The care day of a care log: the calendar day it happened on in the plant's
-- care timezone (its Canopy's, else its owner's), fixed when the care is
-- recorded. Nullable while old code can still insert without it and until
-- same-day duplicates are removed (packages/db/gated/care_day_unique.sql).
ALTER TABLE "care_logs" ADD COLUMN IF NOT EXISTS "care_day" date;
--> statement-breakpoint
-- A stored timezone Postgres does not know would abort AT TIME ZONE, so only
-- known names are used and anything else counts as UTC.
UPDATE "care_logs" cl
SET "care_day" = (cl."date" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date
FROM "plants" p
LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
LEFT JOIN "users" u ON u."id" = p."user_id"
LEFT JOIN pg_timezone_names ctz ON ctz."name" = c."timezone"
LEFT JOIN pg_timezone_names utz ON utz."name" = u."timezone"
WHERE p."id" = cl."plant_id" AND cl."care_day" IS NULL;
