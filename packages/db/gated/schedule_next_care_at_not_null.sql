-- GATED: the migrator applies packages/db/drizzle only, so this file does
-- nothing where it is. Follow packages/db/gated/README.md before it moves
-- into packages/db/drizzle as the next numbered migration.
--
-- Must be true before it runs: no process of a release older than 0073 is
-- left. Such a process changes a frequency with
-- INSERT ... VALUES (..., next_care_at NULL) ON CONFLICT DO UPDATE, and
-- Postgres checks NOT NULL on the inserted values before it looks for the
-- conflict, so every such change fails once the column is NOT NULL.
--
-- It deletes nothing. It fills next_care_at only on rows where it is null.
--
-- Bounds the wait for each lock, the ACCESS EXCLUSIVE lock of SET NOT NULL
-- included. It does not bound the table scan that runs under that lock.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- Fills a row the way 0073 did: one frequency after its latest care, and no
-- earlier than now.
UPDATE "plant_care_schedules"
SET "next_care_at" = GREATEST(
  coalesce("last_care_at" + make_interval(days => "frequency_days"), now()),
  now()
)
WHERE "next_care_at" IS NULL;
--> statement-breakpoint
-- Scans the table once under ACCESS EXCLUSIVE and fails if a null is left.
ALTER TABLE "plant_care_schedules" ALTER COLUMN "next_care_at" SET NOT NULL;
