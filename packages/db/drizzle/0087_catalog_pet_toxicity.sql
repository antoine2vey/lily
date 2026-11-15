-- These catalog plants are toxic to cats and dogs (ASPCA list; ZZ holds calcium oxalate like the other aroids)
-- but were stored at 10-50, which isPetSafe reads as safe. 60 matches the catalog's other mildly toxic plants.
-- Plants created from the catalog copied the value under the catalog name, so a plant with that name
-- still read as safe moves to 60 too. Rows already above 50 are left alone.
WITH toxic AS (
  SELECT id FROM plant_catalog
  WHERE scientific_name IN (
    'Aglaonema commutatum',
    'Aloe barbadensis',
    'Crassula ovata',
    'Dracaena marginata',
    'Epipremnum aureum',
    'Ficus elastica',
    'Ficus lyrata',
    'Lavandula angustifolia',
    'Mentha spicata',
    'Sansevieria trifasciata',
    'Strelitzia reginae',
    'Zamioculcas zamiifolia'
  )
),
catalog AS (
  UPDATE plant_catalog
  SET pet_toxicity_rating = 60
  WHERE id IN (SELECT id FROM toxic)
    AND pet_toxicity_rating <= 50
)
UPDATE plants
SET pet_toxicity_rating = 60
WHERE pet_toxicity_rating <= 50
  AND lower(btrim(name)) IN (
    SELECT lower(name) FROM plant_catalog_translations
    WHERE catalog_id IN (SELECT id FROM toxic)
  );
