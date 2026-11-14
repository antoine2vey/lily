-- GATED: the migrator applies packages/db/drizzle only, so this file does
-- nothing where it is. Follow packages/db/gated/README.md before it moves
-- into packages/db/drizzle as the next numbered migration.
--
-- Must be true before it runs: every running process sets due_day when it
-- inserts a schedule (the release that contains 0074 and 0077 is fully
-- deployed and no older process is left). An older process inserts without
-- the column, and that insert fails once the column is NOT NULL.
--
-- It deletes nothing. It fills due_day only on rows where it is null.
--
-- Bounds the wait for each lock, the ACCESS EXCLUSIVE lock of SET NOT NULL
-- included. It does not bound the table scan that runs under that lock.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- Fills a row an older process inserted, the way 0074 did: the day of the
-- due instant in the plant's care timezone (its Canopy's, else its owner's).
-- A stored timezone Postgres does not know counts as UTC.
UPDATE "plant_care_schedules" s
SET "due_day" = (s."next_care_at" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date
FROM "plants" p
LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
LEFT JOIN "users" u ON u."id" = p."user_id"
LEFT JOIN pg_timezone_names ctz ON ctz."name" = c."timezone"
LEFT JOIN pg_timezone_names utz ON utz."name" = u."timezone"
WHERE p."id" = s."plant_id" AND s."due_day" IS NULL;
--> statement-breakpoint
-- Scans the table once under ACCESS EXCLUSIVE and fails if a null is left.
ALTER TABLE "plant_care_schedules" ALTER COLUMN "due_day" SET NOT NULL;
