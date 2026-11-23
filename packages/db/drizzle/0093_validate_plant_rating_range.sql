-- Checks the existing rows against the 0092 rating constraints. VALIDATE takes
-- SHARE UPDATE EXCLUSIVE, so the scan runs beside reads and writes. A row
-- outside 0-100 fails this file and stops the deploy, while 0092 keeps
-- checking new writes.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "plants" VALIDATE CONSTRAINT "plants_humidity_rating_range";
--> statement-breakpoint
ALTER TABLE "plants" VALIDATE CONSTRAINT "plants_lighting_rating_range";
--> statement-breakpoint
ALTER TABLE "plants" VALIDATE CONSTRAINT "plants_pet_toxicity_rating_range";
--> statement-breakpoint
ALTER TABLE "plants" VALIDATE CONSTRAINT "plants_watering_rating_range";
--> statement-breakpoint
ALTER TABLE "plant_catalog" VALIDATE CONSTRAINT "plant_catalog_humidity_rating_range";
--> statement-breakpoint
ALTER TABLE "plant_catalog" VALIDATE CONSTRAINT "plant_catalog_lighting_rating_range";
--> statement-breakpoint
ALTER TABLE "plant_catalog" VALIDATE CONSTRAINT "plant_catalog_pet_toxicity_rating_range";
--> statement-breakpoint
ALTER TABLE "plant_catalog" VALIDATE CONSTRAINT "plant_catalog_watering_rating_range";
