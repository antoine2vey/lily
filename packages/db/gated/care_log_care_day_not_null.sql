-- GATED: the migrator applies packages/db/drizzle only, so this file does
-- nothing where it is. Follow packages/db/gated/README.md before it moves
-- into packages/db/drizzle as the next numbered migration.
--
-- Must be true before it runs: every running process sets care_day when it
-- inserts a care log (the release that contains 0072 and 0077 is fully
-- deployed and no older process is left). An older process inserts without
-- the column, and that insert fails once the column is NOT NULL.
--
-- It deletes nothing. It fills care_day only on rows where it is null. The
-- one-care-per-day index stays in care_day_unique.sql, which does delete.
--
-- Bounds the wait for each lock, the ACCESS EXCLUSIVE lock of SET NOT NULL
-- included. It does not bound the table scan that runs under that lock.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- Fills a row an older process inserted, the way 0072 did: the day of the
-- care instant in the plant's care timezone (its Canopy's, else its owner's).
-- A stored timezone Postgres does not know counts as UTC.
UPDATE "care_logs" cl
SET "care_day" = (cl."date" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date
FROM "plants" p
LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
LEFT JOIN "users" u ON u."id" = p."user_id"
LEFT JOIN pg_timezone_names ctz ON ctz."name" = c."timezone"
LEFT JOIN pg_timezone_names utz ON utz."name" = u."timezone"
WHERE p."id" = cl."plant_id" AND cl."care_day" IS NULL;
--> statement-breakpoint
-- Scans the table once under ACCESS EXCLUSIVE and fails if a null is left.
ALTER TABLE "care_logs" ALTER COLUMN "care_day" SET NOT NULL;
