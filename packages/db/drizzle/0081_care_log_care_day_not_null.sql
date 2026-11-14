SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
UPDATE "care_logs" cl
SET "care_day" = (cl."date" AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date
FROM "plants" p
LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
LEFT JOIN "users" u ON u."id" = p."user_id"
LEFT JOIN pg_timezone_names ctz ON ctz."name" = c."timezone"
LEFT JOIN pg_timezone_names utz ON utz."name" = u."timezone"
WHERE p."id" = cl."plant_id" AND cl."care_day" IS NULL;
--> statement-breakpoint
ALTER TABLE "care_logs" ALTER COLUMN "care_day" SET NOT NULL;
