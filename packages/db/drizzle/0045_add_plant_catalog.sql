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
