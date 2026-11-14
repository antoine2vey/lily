SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
UPDATE "plant_care_schedules" s
SET "due_day" = (s."next_care_at" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date
FROM "plants" p
LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
LEFT JOIN "users" u ON u."id" = p."user_id"
LEFT JOIN pg_timezone_names ctz ON ctz."name" = c."timezone"
LEFT JOIN pg_timezone_names utz ON utz."name" = u."timezone"
WHERE p."id" = s."plant_id" AND s."due_day" IS NULL;
--> statement-breakpoint
ALTER TABLE "plant_care_schedules" ALTER COLUMN "due_day" SET NOT NULL;
