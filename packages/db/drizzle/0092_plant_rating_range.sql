-- Holds every rating to the 0-100 scale of the Rating brand in @lily/shared.
-- NOT VALID adds each check without scanning the table, so the ACCESS
-- EXCLUSIVE lock lasts milliseconds, and new writes are checked from here on.
-- 0093 checks the existing rows under a lock that lets reads and writes run.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "plants"
  ADD CONSTRAINT "plants_humidity_rating_range" CHECK ("humidity_rating" BETWEEN 0 AND 100) NOT VALID,
  ADD CONSTRAINT "plants_lighting_rating_range" CHECK ("lighting_rating" BETWEEN 0 AND 100) NOT VALID,
  ADD CONSTRAINT "plants_pet_toxicity_rating_range" CHECK ("pet_toxicity_rating" BETWEEN 0 AND 100) NOT VALID,
  ADD CONSTRAINT "plants_watering_rating_range" CHECK ("watering_rating" BETWEEN 0 AND 100) NOT VALID;
--> statement-breakpoint
ALTER TABLE "plant_catalog"
  ADD CONSTRAINT "plant_catalog_humidity_rating_range" CHECK ("humidity_rating" BETWEEN 0 AND 100) NOT VALID,
  ADD CONSTRAINT "plant_catalog_lighting_rating_range" CHECK ("lighting_rating" BETWEEN 0 AND 100) NOT VALID,
  ADD CONSTRAINT "plant_catalog_pet_toxicity_rating_range" CHECK ("pet_toxicity_rating" BETWEEN 0 AND 100) NOT VALID,
  ADD CONSTRAINT "plant_catalog_watering_rating_range" CHECK ("watering_rating" BETWEEN 0 AND 100) NOT VALID;
