CREATE TYPE "public"."care_type" AS ENUM('watering', 'fertilization');--> statement-breakpoint
CREATE TABLE "plant_care_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"care_type" "care_type" NOT NULL,
	"frequency_days" integer NOT NULL,
	"last_care_at" timestamp with time zone,
	"next_care_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plant_care_schedules_plant_type_uniq" UNIQUE("plant_id","care_type")
);
--> statement-breakpoint
ALTER TABLE "plant_care_schedules" ADD CONSTRAINT "plant_care_schedules_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plant_care_schedules_plant_id_idx" ON "plant_care_schedules" USING btree ("plant_id");--> statement-breakpoint
CREATE INDEX "plant_care_schedules_next_care_at_idx" ON "plant_care_schedules" USING btree ("next_care_at");--> statement-breakpoint

-- Seed watering schedules from existing plant columns
INSERT INTO "plant_care_schedules" ("plant_id", "care_type", "frequency_days", "last_care_at", "next_care_at")
SELECT "id", 'watering', "watering_frequency_days", "last_watered_at", "next_watering_at"
FROM "plants";--> statement-breakpoint

-- Seed fertilization schedules from existing plant columns (only where frequency is set)
INSERT INTO "plant_care_schedules" ("plant_id", "care_type", "frequency_days", "last_care_at", "next_care_at")
SELECT "id", 'fertilization', "fertilization_frequency_days", "last_fertilized_at", "next_fertilization_at"
FROM "plants"
WHERE "fertilization_frequency_days" IS NOT NULL;