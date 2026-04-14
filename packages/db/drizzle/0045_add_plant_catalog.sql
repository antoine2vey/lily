CREATE TABLE IF NOT EXISTS "plant_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scientific_name" text,
	"family" text,
	"category" text,
	"image_url" text,
	"watering_frequency_days" integer NOT NULL,
	"fertilization_frequency_days" integer,
	"misting_frequency_days" integer,
	"repotting_frequency_days" integer,
	"humidity_rating" integer NOT NULL,
	"lighting_rating" integer NOT NULL,
	"pet_toxicity_rating" integer NOT NULL,
	"watering_rating" integer NOT NULL,
	"lux_needed" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plant_catalog_category_idx" ON "plant_catalog" USING btree ("category");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plant_catalog_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL REFERENCES "plant_catalog"("id") ON DELETE CASCADE,
	"language" "language_code" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "plant_catalog_translations_unique" UNIQUE("catalog_id", "language")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plant_catalog_translations_name_idx" ON "plant_catalog_translations" USING btree ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plant_catalog_translations_lang_idx" ON "plant_catalog_translations" USING btree ("language");
--> statement-breakpoint
-- Seed: 39 common houseplants with EN/FR translations
-- Plant 1: Monstera deliciosa
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Monstera deliciosa', 'Araceae', 'Tropical', 7, 21, 3, 365, 60, 3, 60, 60, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Monstera deliciosa')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Monstera', 'Tropical plant with iconic split leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Monstera', 'Plante tropicale aux feuilles découpées emblématiques' FROM inserted;
--> statement-breakpoint
-- Plant 2: Ficus lyrata
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Ficus lyrata', 'Moraceae', 'Tree', 7, 14, NULL, 365, 60, 4, 50, 60, 5000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Ficus lyrata')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Fiddle Leaf Fig', 'Popular indoor tree with large fiddle-shaped leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Figuier lyre', 'Arbre d''intérieur populaire aux grandes feuilles en forme de lyre' FROM inserted;
--> statement-breakpoint
-- Plant 3: Strelitzia reginae
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Strelitzia reginae', 'Strelitziaceae', 'Tropical', 7, 14, 3, 730, 50, 5, 40, 60, 8000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Strelitzia reginae')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Bird of Paradise', 'Dramatic tropical plant with large paddle-shaped leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Oiseau de paradis', 'Plante tropicale spectaculaire aux grandes feuilles en forme de pagaie' FROM inserted;
--> statement-breakpoint
-- Plant 4: Calathea orbifolia
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Calathea orbifolia', 'Marantaceae', 'Tropical', 5, 30, 2, 365, 80, 2, 10, 80, 1500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Calathea orbifolia')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Calathea', 'Prayer plant with stunning striped foliage' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Calathéa', 'Plante de prière au feuillage rayé magnifique' FROM inserted;
--> statement-breakpoint
-- Plant 5: Philodendron hederaceum
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Philodendron hederaceum', 'Araceae', 'Tropical', 7, 30, 5, 365, 50, 3, 60, 50, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Philodendron hederaceum')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Philodendron', 'Easy-going tropical with heart-shaped leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Philodendron', 'Plante tropicale facile aux feuilles en forme de cœur' FROM inserted;
--> statement-breakpoint
-- Plant 6: Ficus elastica
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Ficus elastica', 'Moraceae', 'Tree', 10, 30, NULL, 730, 40, 3, 50, 40, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Ficus elastica')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Rubber Plant', 'Bold indoor tree with thick glossy leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Caoutchouc', 'Arbre d''intérieur imposant aux feuilles épaisses et brillantes' FROM inserted;
--> statement-breakpoint
-- Plant 7: Alocasia amazonica
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Alocasia amazonica', 'Araceae', 'Tropical', 5, 14, 2, 365, 70, 3, 70, 70, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Alocasia amazonica')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Alocasia', 'Striking tropical with arrow-shaped veined leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Alocasia', 'Tropicale saisissante aux feuilles nervurées en forme de flèche' FROM inserted;
--> statement-breakpoint
-- Plant 8: Sansevieria trifasciata
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Sansevieria trifasciata', 'Asparagaceae', 'Succulent', 14, 60, NULL, 730, 20, 3, 40, 20, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Sansevieria trifasciata')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Snake Plant', 'Hardy succulent with upright sword-shaped leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Langue de belle-mère', 'Succulente résistante aux feuilles dressées en forme d''épée' FROM inserted;
--> statement-breakpoint
-- Plant 9: Aloe barbadensis
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Aloe barbadensis', 'Asphodelaceae', 'Succulent', 14, 60, NULL, 730, 20, 4, 30, 20, 5000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Aloe barbadensis')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Aloe Vera', 'Medicinal succulent with healing gel inside its leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Aloe Vera', 'Succulente médicinale au gel cicatrisant dans ses feuilles' FROM inserted;
--> statement-breakpoint
-- Plant 10: Crassula ovata
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Crassula ovata', 'Crassulaceae', 'Succulent', 14, 60, NULL, 730, 20, 4, 40, 20, 5000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Crassula ovata')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Jade Plant', 'Lucky money tree with thick oval leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Arbre de jade', 'Arbre porte-bonheur aux feuilles ovales épaisses' FROM inserted;
--> statement-breakpoint
-- Plant 11: Echeveria elegans
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Echeveria elegans', 'Crassulaceae', 'Succulent', 14, 60, NULL, 365, 15, 5, 10, 15, 10000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Echeveria elegans')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Echeveria', 'Rosette-shaped succulent in pastel colors' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Echeveria', 'Succulente en rosette aux couleurs pastel' FROM inserted;
--> statement-breakpoint
-- Plant 12: Opuntia microdasys
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Opuntia microdasys', 'Cactaceae', 'Succulent', 21, 90, NULL, 730, 10, 5, 20, 10, 10000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Opuntia microdasys')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Cactus', 'Classic desert plant, extremely low maintenance' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Cactus', 'Plante du désert classique, très facile d''entretien' FROM inserted;
--> statement-breakpoint
-- Plant 13: Senecio rowleyanus
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Senecio rowleyanus', 'Asteraceae', 'Succulent', 14, 30, NULL, 365, 20, 4, 60, 20, 5000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Senecio rowleyanus')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'String of Pearls', 'Trailing succulent with bead-like leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Collier de perles', 'Succulente retombante aux feuilles en forme de perles' FROM inserted;
--> statement-breakpoint
-- Plant 14: Epipremnum aureum
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Epipremnum aureum', 'Araceae', 'Vine', 7, 30, NULL, 365, 40, 2, 50, 40, 1500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Epipremnum aureum')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Pothos', 'Beginner-friendly trailing vine with heart-shaped leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Pothos', 'Liane retombante pour débutants aux feuilles en forme de cœur' FROM inserted;
--> statement-breakpoint
-- Plant 15: Hedera helix
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Hedera helix', 'Araliaceae', 'Vine', 7, 30, 3, 365, 50, 3, 60, 50, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Hedera helix')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'English Ivy', 'Classic trailing ivy, great air purifier' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Lierre', 'Lierre classique retombant, excellent purificateur d''air' FROM inserted;
--> statement-breakpoint
-- Plant 16: Hoya carnosa
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Hoya carnosa', 'Apocynaceae', 'Vine', 10, 30, NULL, 730, 40, 3, 10, 30, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Hoya carnosa')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Hoya', 'Wax plant with thick leaves and fragrant star-shaped flowers' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Fleur de porcelaine', 'Plante de cire aux feuilles épaisses et fleurs étoilées parfumées' FROM inserted;
--> statement-breakpoint
-- Plant 17: Nephrolepis exaltata
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Nephrolepis exaltata', 'Nephrolepidaceae', 'Fern', 3, 30, 2, 365, 80, 2, 10, 80, 1500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Nephrolepis exaltata')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Boston Fern', 'Lush green fern with arching fronds' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Fougère de Boston', 'Fougère luxuriante aux frondes arquées' FROM inserted;
--> statement-breakpoint
-- Plant 18: Adiantum raddianum
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Adiantum raddianum', 'Pteridaceae', 'Fern', 2, 30, 1, 365, 90, 2, 10, 90, 1500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Adiantum raddianum')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Maidenhair Fern', 'Delicate fern with small fan-shaped leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Capillaire', 'Fougère délicate aux petites feuilles en éventail' FROM inserted;
--> statement-breakpoint
-- Plant 19: Spathiphyllum wallisii
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Spathiphyllum wallisii', 'Araceae', 'Flowering', 5, 30, 3, 365, 60, 2, 70, 70, 1500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Spathiphyllum wallisii')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Peace Lily', 'Elegant flowering plant with white blooms' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Lys de paix', 'Plante élégante aux fleurs blanches' FROM inserted;
--> statement-breakpoint
-- Plant 20: Phalaenopsis spp.
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Phalaenopsis spp.', 'Orchidaceae', 'Flowering', 7, 14, 3, 730, 60, 3, 10, 40, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Phalaenopsis spp.')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Orchid', 'Elegant flowering plant with long-lasting blooms' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Orchidée', 'Plante élégante aux fleurs durables' FROM inserted;
--> statement-breakpoint
-- Plant 21: Anthurium andraeanum
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Anthurium andraeanum', 'Araceae', 'Flowering', 5, 30, 3, 365, 70, 3, 60, 60, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Anthurium andraeanum')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Anthurium', 'Tropical plant with glossy red heart-shaped flowers' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Anthurium', 'Plante tropicale aux fleurs rouges brillantes en forme de cœur' FROM inserted;
--> statement-breakpoint
-- Plant 22: Zamioculcas zamiifolia
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Zamioculcas zamiifolia', 'Araceae', 'Tropical', 14, 60, NULL, 730, 30, 1, 50, 20, 500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Zamioculcas zamiifolia')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'ZZ Plant', 'Nearly indestructible plant with glossy dark leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Plante ZZ', 'Plante quasi indestructible aux feuilles sombres et brillantes' FROM inserted;
--> statement-breakpoint
-- Plant 23: Chlorophytum comosum
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Chlorophytum comosum', 'Asparagaceae', 'Grass', 7, 30, NULL, 365, 40, 2, 10, 50, 1500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Chlorophytum comosum')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Spider Plant', 'Air-purifying plant that produces baby plantlets' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Plante araignée', 'Plante purificatrice d''air qui produit des plantules' FROM inserted;
--> statement-breakpoint
-- Plant 24: Dracaena marginata
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Dracaena marginata', 'Asparagaceae', 'Tree', 10, 30, NULL, 730, 40, 3, 50, 40, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Dracaena marginata')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Dracaena', 'Tree-like plant with slender striped leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Dracaena', 'Plante arborescente aux feuilles fines et rayées' FROM inserted;
--> statement-breakpoint
-- Plant 25: Ocimum basilicum
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Ocimum basilicum', 'Lamiaceae', 'Herb', 2, 14, NULL, NULL, 50, 5, 10, 70, 10000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Ocimum basilicum')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Basil', 'Fragrant culinary herb for cooking' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Basilic', 'Herbe culinaire parfumée pour la cuisine' FROM inserted;
--> statement-breakpoint
-- Plant 26: Mentha spicata
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Mentha spicata', 'Lamiaceae', 'Herb', 2, 30, NULL, 180, 50, 4, 10, 70, 5000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Mentha spicata')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Mint', 'Fast-growing aromatic herb' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Menthe', 'Herbe aromatique à croissance rapide' FROM inserted;
--> statement-breakpoint
-- Plant 27: Lavandula angustifolia
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Lavandula angustifolia', 'Lamiaceae', 'Flowering', 10, 30, NULL, 365, 20, 5, 10, 20, 10000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Lavandula angustifolia')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Lavender', 'Fragrant purple-flowering Mediterranean shrub' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Lavande', 'Arbuste méditerranéen parfumé aux fleurs violettes' FROM inserted;
--> statement-breakpoint
-- Plant 28: Dypsis lutescens
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Dypsis lutescens', 'Arecaceae', 'Palm', 7, 30, 3, 730, 50, 3, 10, 50, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Dypsis lutescens')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Areca Palm', 'Graceful indoor palm with feathery fronds' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Palmier areca', 'Palmier d''intérieur gracieux aux frondes plumeuses' FROM inserted;
--> statement-breakpoint
-- Plant 29: Chamaedorea elegans
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Chamaedorea elegans', 'Arecaceae', 'Palm', 7, 30, 5, 730, 50, 2, 10, 50, 1500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Chamaedorea elegans')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Parlor Palm', 'Compact palm perfect for low-light spaces' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Palmier nain', 'Petit palmier parfait pour les espaces peu éclairés' FROM inserted;
--> statement-breakpoint
-- Plant 30: Pilea peperomioides
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Pilea peperomioides', 'Urticaceae', 'Tropical', 7, 30, NULL, 365, 40, 3, 10, 40, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Pilea peperomioides')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Pilea', 'Chinese money plant with round coin-shaped leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Pilea', 'Plante à monnaie chinoise aux feuilles rondes en forme de pièce' FROM inserted;
--> statement-breakpoint
-- Plant 31: Peperomia obtusifolia
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Peperomia obtusifolia', 'Piperaceae', 'Tropical', 10, 30, NULL, 365, 40, 3, 10, 30, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Peperomia obtusifolia')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Peperomia', 'Compact plant with thick, glossy leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Peperomia', 'Plante compacte aux feuilles épaisses et brillantes' FROM inserted;
--> statement-breakpoint
-- Plant 32: Ceropegia woodii
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Ceropegia woodii', 'Apocynaceae', 'Vine', 10, 30, NULL, 365, 30, 4, 10, 30, 5000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Ceropegia woodii')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'String of Hearts', 'Delicate trailing vine with heart-shaped leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Chaîne de cœurs', 'Liane délicate retombante aux feuilles en forme de cœur' FROM inserted;
--> statement-breakpoint
-- Plant 33: Platycerium bifurcatum
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Platycerium bifurcatum', 'Polypodiaceae', 'Fern', 7, 30, 3, NULL, 60, 3, 10, 60, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Platycerium bifurcatum')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Staghorn Fern', 'Unique mounted fern with antler-like fronds' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Fougère corne de cerf', 'Fougère unique aux frondes en forme de bois de cerf' FROM inserted;
--> statement-breakpoint
-- Plant 34: Saintpaulia ionantha
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Saintpaulia ionantha', 'Gesneriaceae', 'Flowering', 5, 14, NULL, 365, 50, 3, 10, 50, 2500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Saintpaulia ionantha')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'African Violet', 'Compact flowering plant with velvety leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Violette africaine', 'Plante fleurie compacte aux feuilles veloutées' FROM inserted;
--> statement-breakpoint
-- Plant 35: Aglaonema commutatum
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Aglaonema commutatum', 'Araceae', 'Tropical', 10, 30, NULL, 730, 50, 2, 50, 40, 1500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Aglaonema commutatum')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Chinese Evergreen', 'Colorful foliage plant that thrives in low light' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Aglaonéma', 'Plante au feuillage coloré qui prospère en faible luminosité' FROM inserted;
--> statement-breakpoint
-- Plant 36: Aspidistra elatior
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Aspidistra elatior', 'Asparagaceae', 'Tropical', 14, 60, NULL, 730, 30, 1, 10, 20, 500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Aspidistra elatior')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Cast Iron Plant', 'Tough plant that survives neglect and deep shade' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Aspidistra', 'Plante robuste qui résiste à la négligence et à l''ombre profonde' FROM inserted;
--> statement-breakpoint
-- Plant 37: Salvia rosmarinus
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Salvia rosmarinus', 'Lamiaceae', 'Herb', 7, 30, NULL, 365, 30, 5, 10, 30, 10000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Salvia rosmarinus')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Rosemary', 'Woody Mediterranean herb with needle-like leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Romarin', 'Herbe méditerranéenne ligneuse aux feuilles en forme d''aiguilles' FROM inserted;
--> statement-breakpoint
-- Plant 38: Codiaeum variegatum
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Codiaeum variegatum', 'Euphorbiaceae', 'Tropical', 5, 14, 3, 365, 60, 4, 60, 60, 5000
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Codiaeum variegatum')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Croton', 'Colorful tropical shrub with multicolored leaves' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Croton', 'Arbuste tropical coloré aux feuilles multicolores' FROM inserted;
--> statement-breakpoint
-- Plant 39: Dieffenbachia seguine
WITH inserted AS (
  INSERT INTO plant_catalog (scientific_name, family, category, watering_frequency_days, fertilization_frequency_days, misting_frequency_days, repotting_frequency_days, humidity_rating, lighting_rating, pet_toxicity_rating, watering_rating, lux_needed)
  SELECT 'Dieffenbachia seguine', 'Araceae', 'Tropical', 7, 30, NULL, 365, 50, 2, 80, 50, 1500
  WHERE NOT EXISTS (SELECT 1 FROM plant_catalog WHERE scientific_name = 'Dieffenbachia seguine')
  RETURNING id
)
INSERT INTO plant_catalog_translations (catalog_id, language, name, description)
SELECT id, 'en'::language_code, 'Dieffenbachia', 'Large-leafed tropical with striking patterns' FROM inserted
UNION ALL
SELECT id, 'fr'::language_code, 'Dieffenbachia', 'Tropicale à grandes feuilles aux motifs saisissants' FROM inserted;
