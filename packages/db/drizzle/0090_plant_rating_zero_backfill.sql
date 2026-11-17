-- Backfills the humidity and watering ratings that creates stored as 0 when the
-- request named none, before #331 and #334 derived a value (#329). Nothing
-- stores which path created a plant, and the manual and edit sliders can store
-- a deliberate 0, so a row is backfilled only when no path that writes a chosen
-- 0 could have produced it. Every other 0 stays.
--
-- Watering, where a watering schedule gives the frequency:
--   * created before 2026-04-21T10:55:50Z, when the api took no watering rating
--   * a pet rating other than 0 or 100, which only the scanner and onboarding
--     write, and neither sends a watering rating. 0087 set 60 on manual plants
--     named after a toxic catalog entry, so those names stay out.
--   * the MCP create_plant shape below
-- Humidity: only the MCP create_plant shape, since every app create sends one.
-- The MCP shape is both ratings 0, no image, description or category, the
-- lighting rating of bright indirect light, a pet rating of 0 or 100, a creator
-- who linked MCP, and a create between create_plant reaching main and #331.
--
-- plant_rating_backfill keeps each old value for the undo. A plant already in
-- it is never backfilled again, so a 0 the user sets later stays.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plant_rating_backfill" (
  "plant_id" uuid NOT NULL REFERENCES "plants"("id") ON DELETE CASCADE,
  "rating" text NOT NULL,
  "old_value" integer NOT NULL,
  "new_value" integer NOT NULL,
  "backfilled_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plant_rating_backfill_plant_id_rating_pk" PRIMARY KEY ("plant_id", "rating")
);
--> statement-breakpoint
WITH "mcp_created" AS (
  SELECT p."id"
  FROM "plants" p
  WHERE p."humidity_rating" = 0
    AND p."watering_rating" = 0
    AND p."image_url" IS NULL
    AND p."description" IS NULL
    AND p."category" IS NULL
    AND p."lighting_rating" = 50
    AND p."pet_toxicity_rating" IN (0, 100)
    AND p."date_added" >= '2026-11-02T10:35:04Z'
    AND p."date_added" < '2026-11-17T16:08:04Z'
    AND EXISTS (
      SELECT 1 FROM "oauth_user_api_credentials" c
      WHERE c."user_id" = p."created_by_user_id"
    )
),
"toxic_catalog_names" AS (
  SELECT lower(t."name") AS "name"
  FROM "plant_catalog_translations" t
  JOIN "plant_catalog" pc ON pc."id" = t."catalog_id"
  WHERE pc."scientific_name" IN (
    'Aglaonema commutatum', 'Aloe barbadensis', 'Crassula ovata',
    'Dracaena marginata', 'Epipremnum aureum', 'Ficus elastica',
    'Ficus lyrata', 'Lavandula angustifolia', 'Mentha spicata',
    'Sansevieria trifasciata', 'Strelitzia reginae', 'Zamioculcas zamiifolia'
  )
),
"candidates" AS (
  SELECT m."id" AS "plant_id", 'humidity' AS "rating", 0 AS "old_value", 50 AS "new_value"
  FROM "mcp_created" m
  UNION ALL
  SELECT p."id", 'watering', p."watering_rating",
    CASE
      WHEN s."frequency_days" <= 5 THEN 70
      WHEN s."frequency_days" <= 8 THEN 50
      WHEN s."frequency_days" <= 12 THEN 30
      ELSE 10
    END
  FROM "plants" p
  JOIN "plant_care_schedules" s
    ON s."plant_id" = p."id" AND s."care_type" = 'watering'
  WHERE p."watering_rating" = 0
    AND p."date_added" < '2026-11-17T16:39:00Z'
    AND (
      p."date_added" < '2026-04-21T10:55:50Z'
      OR (
        p."pet_toxicity_rating" NOT IN (0, 100)
        AND NOT (
          p."pet_toxicity_rating" = 60
          AND lower(btrim(p."name")) IN (SELECT "name" FROM "toxic_catalog_names")
        )
      )
      OR p."id" IN (SELECT "id" FROM "mcp_created")
    )
),
"recorded" AS (
  INSERT INTO "plant_rating_backfill" ("plant_id", "rating", "old_value", "new_value")
  SELECT "plant_id", "rating", "old_value", "new_value" FROM "candidates"
  ON CONFLICT ("plant_id", "rating") DO NOTHING
  RETURNING "plant_id", "rating", "new_value"
),
"backfilled" AS (
  SELECT "plant_id",
    max("new_value") FILTER (WHERE "rating" = 'humidity') AS "humidity",
    max("new_value") FILTER (WHERE "rating" = 'watering') AS "watering"
  FROM "recorded"
  GROUP BY "plant_id"
)
UPDATE "plants" p
SET "humidity_rating" = coalesce(b."humidity", p."humidity_rating"),
  "watering_rating" = coalesce(b."watering", p."watering_rating")
FROM "backfilled" b
WHERE b."plant_id" = p."id";
