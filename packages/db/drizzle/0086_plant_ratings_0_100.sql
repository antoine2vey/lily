-- Plant ratings are stored 0-100. Seeded plants and the catalog lighting column were written 1-5.
-- Mapping per column: 1->10, 2->30, 3->50, 4->70, 5->90 (the luminosity slider stops).
-- A plants row is on the old scale when its humidity and watering ratings are both in 1..5.
UPDATE plants
SET
  humidity_rating = CASE WHEN humidity_rating BETWEEN 1 AND 5 THEN humidity_rating * 20 - 10 ELSE humidity_rating END,
  lighting_rating = CASE WHEN lighting_rating BETWEEN 1 AND 5 THEN lighting_rating * 20 - 10 ELSE lighting_rating END,
  watering_rating = CASE WHEN watering_rating BETWEEN 1 AND 5 THEN watering_rating * 20 - 10 ELSE watering_rating END,
  pet_toxicity_rating = CASE WHEN pet_toxicity_rating BETWEEN 1 AND 5 THEN pet_toxicity_rating * 20 - 10 ELSE pet_toxicity_rating END
WHERE humidity_rating BETWEEN 1 AND 5
  AND watering_rating BETWEEN 1 AND 5;
--> statement-breakpoint
UPDATE plant_catalog
SET lighting_rating = lighting_rating * 20 - 10
WHERE lighting_rating BETWEEN 1 AND 5;
