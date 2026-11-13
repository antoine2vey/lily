-- Every schedule has a next due instant and a frequency of at least one day.
-- A schedule without a due instant was never reminded. It becomes due one
-- frequency after its latest care, and no earlier than now, so it does not
-- surface as overdue for the whole time it had no due instant.
UPDATE "plant_care_schedules" SET "frequency_days" = 1 WHERE "frequency_days" < 1;
--> statement-breakpoint
UPDATE "plant_care_schedules"
SET "next_care_at" = GREATEST(
  coalesce("last_care_at" + make_interval(days => "frequency_days"), now()),
  now()
)
WHERE "next_care_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "plant_care_schedules" ALTER COLUMN "next_care_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "plant_care_schedules" DROP CONSTRAINT IF EXISTS "plant_care_schedules_frequency_days_min";
--> statement-breakpoint
ALTER TABLE "plant_care_schedules" ADD CONSTRAINT "plant_care_schedules_frequency_days_min" CHECK ("frequency_days" >= 1);
