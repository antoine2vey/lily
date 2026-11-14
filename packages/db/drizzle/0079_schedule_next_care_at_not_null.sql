SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
UPDATE "plant_care_schedules"
SET "next_care_at" = GREATEST(
  coalesce("last_care_at" + make_interval(days => "frequency_days"), now()),
  now()
)
WHERE "next_care_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "plant_care_schedules" ALTER COLUMN "next_care_at" SET NOT NULL;
