-- GATED: the migrator applies packages/db/drizzle only, so this file does
-- nothing where it is. Follow packages/db/gated/README.md before it moves
-- into packages/db/drizzle as the next numbered migration.
--
-- Needed only when a process of a release older than 0072 wrote after that
-- migration ran: during the rollout, or during a rollback. Such a process
-- moves next_care_at and care_logs.date and leaves the stored day where it
-- was, so the day no longer matches its instant.
--
-- Must be true before it runs: no process of an older release is left.
--
-- It deletes nothing. It sets a stored day back to the day of its instant
-- in the plant's care timezone (its Canopy's, else its owner's), the way
-- 0072 and 0074 filled it. That also covers a row whose owner changed
-- timezone since the day was written. Rows without a stored day stay null.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
UPDATE "plant_care_schedules" s
SET "due_day" = (s."next_care_at" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date
FROM "plants" p
LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
LEFT JOIN "users" u ON u."id" = p."user_id"
LEFT JOIN pg_timezone_names ctz ON ctz."name" = c."timezone"
LEFT JOIN pg_timezone_names utz ON utz."name" = u."timezone"
WHERE p."id" = s."plant_id"
  AND s."due_day" <> (s."next_care_at" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date;
--> statement-breakpoint
UPDATE "care_logs" cl
SET "care_day" = (cl."date" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date
FROM "plants" p
LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
LEFT JOIN "users" u ON u."id" = p."user_id"
LEFT JOIN pg_timezone_names ctz ON ctz."name" = c."timezone"
LEFT JOIN pg_timezone_names utz ON utz."name" = u."timezone"
WHERE p."id" = cl."plant_id"
  AND cl."care_day" <> (cl."date" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date;
