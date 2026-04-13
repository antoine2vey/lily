-- Convert lightingRating from legacy 1-5 luminosity scale to 0-100 slider scale
-- Mapping: 1->10, 2->30, 3->50, 4->70, 5->90
-- Only applies to rows still on the old scale (values <= 5)
UPDATE plants
SET lighting_rating = CASE lighting_rating
  WHEN 1 THEN 10
  WHEN 2 THEN 30
  WHEN 3 THEN 50
  WHEN 4 THEN 70
  WHEN 5 THEN 90
  ELSE lighting_rating
END
WHERE lighting_rating BETWEEN 1 AND 5;
