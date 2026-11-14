-- The due day of a schedule as a calendar day in the plant's care timezone.
-- Written next to next_care_at for now; readers move to it, and next_care_at
-- goes away, in a later migration once no running code depends on the
-- instant. Nullable until then because old code inserts without it.
ALTER TABLE "plant_care_schedules" ADD COLUMN IF NOT EXISTS "due_day" date;
--> statement-breakpoint
UPDATE "plant_care_schedules" s
SET "due_day" = (s."next_care_at" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date
FROM "plants" p
LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
LEFT JOIN "users" u ON u."id" = p."user_id"
LEFT JOIN pg_timezone_names ctz ON ctz."name" = c."timezone"
LEFT JOIN pg_timezone_names utz ON utz."name" = u."timezone"
WHERE p."id" = s."plant_id" AND s."due_day" IS NULL;
