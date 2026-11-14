DO $$
DECLARE
  attempts integer := 0;
BEGIN
  LOOP
    BEGIN
      LOCK TABLE "notifications" IN EXCLUSIVE MODE NOWAIT;
      EXIT;
    EXCEPTION
      WHEN lock_not_available THEN
        attempts := attempts + 1;
        IF attempts >= 200 THEN
          RAISE;
        END IF;
        PERFORM pg_sleep(0.05);
    END;
  END LOOP;
END $$;
--> statement-breakpoint
WITH "undated" AS (
  SELECT
    n."id",
    n."user_id",
    n."plant_id",
    n."type",
    n."status" <> 'pending' AS "handed_over",
    coalesce(n."sent_at", n."scheduled_at") AS "instant",
    CASE
      WHEN n."status" = 'pending' THEN s."due_day"
      ELSE (coalesce(n."sent_at", n."scheduled_at") AT TIME ZONE coalesce(ctz."name", utz."name", 'UTC'))::date
    END AS "day"
  FROM "notifications" n
  JOIN "plants" p ON p."id" = n."plant_id"
  LEFT JOIN "canopies" c ON c."id" = p."canopy_id"
  LEFT JOIN "users" u ON u."id" = p."user_id"
  LEFT JOIN pg_timezone_names ctz ON ctz."name" = c."timezone"
  LEFT JOIN pg_timezone_names utz ON utz."name" = u."timezone"
  LEFT JOIN "plant_care_schedules" s
    ON s."plant_id" = n."plant_id"
    AND s."care_type"::text || '_reminder' = n."type"::text
  WHERE n."occasion_day" IS NULL
    AND n."type" IN (
      'watering_reminder',
      'fertilization_reminder',
      'misting_reminder',
      'repotting_reminder'
    )
    AND p."died_at" IS NULL
    AND (
      n."status" = 'pending'
      OR coalesce(n."sent_at", n."scheduled_at") >= now() - interval '3 days'
    )
),
"ranked" AS (
  SELECT
    "id",
    "day",
    row_number() OVER (
      PARTITION BY "user_id", "plant_id", "type", "day"
      ORDER BY "handed_over" DESC, "instant" DESC, "id"
    ) AS "position"
  FROM "undated"
  WHERE "day" IS NOT NULL
)
UPDATE "notifications" n
SET "occasion_day" = r."day"
FROM "ranked" r
WHERE n."id" = r."id"
  AND r."position" = 1
  AND NOT EXISTS (
    SELECT 1
    FROM "notifications" held
    WHERE held."user_id" = n."user_id"
      AND held."plant_id" = n."plant_id"
      AND held."type" = n."type"
      AND held."occasion_day" = r."day"
  );
