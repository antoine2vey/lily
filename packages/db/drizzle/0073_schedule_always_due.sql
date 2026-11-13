-- Every schedule has a next due instant and a frequency of at least one day.
-- A schedule without a due instant was never reminded. It becomes due one
-- frequency after its latest care, and no earlier than now, so it does not
-- surface as overdue for the whole time it had no due instant.
-- The column becomes NOT NULL in a later release
-- (packages/db/gated/schedule_next_care_at_not_null.sql): the release before
-- this one upserts a schedule with a null due instant in its INSERT values,
-- and Postgres checks NOT NULL on those values even when the row exists.
UPDATE "plant_care_schedules" SET "frequency_days" = 1 WHERE "frequency_days" < 1;
--> statement-breakpoint
UPDATE "plant_care_schedules"
SET "next_care_at" = GREATEST(
  coalesce("last_care_at" + make_interval(days => "frequency_days"), now()),
  now()
)
WHERE "next_care_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "plant_care_schedules" DROP CONSTRAINT IF EXISTS "plant_care_schedules_frequency_days_min";
--> statement-breakpoint
ALTER TABLE "plant_care_schedules" ADD CONSTRAINT "plant_care_schedules_frequency_days_min" CHECK ("frequency_days" >= 1);
