-- 17 of the 39 catalog rows name a lux one luminosity level away from their curated lighting_rating,
-- so a create that sends no lightingRating derives the wrong rating from the lux.
-- The rating is the curated side. Each contradicting row takes the canonical lux of its rating's level
-- (LUMINOSITY_LUX_VALUES). The buckets are the bands of luxToLuminosityLevel and ratingLevel.
UPDATE plant_catalog
SET lux_needed = (ARRAY[100, 500, 2000, 10000, 40000])[width_bucket(lighting_rating, ARRAY[21, 41, 61, 81]) + 1]
WHERE width_bucket(lux_needed, ARRAY[250, 1000, 5000, 25000])
   <> width_bucket(lighting_rating, ARRAY[21, 41, 61, 81]);
