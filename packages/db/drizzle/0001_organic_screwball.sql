CREATE TYPE "public"."care_log_type" AS ENUM('watering', 'fertilization');--> statement-breakpoint
CREATE TABLE "care_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "care_log_type" NOT NULL,
	"notes" text,
	"date" timestamp DEFAULT now() NOT NULL,
	"photo_url" text,
	"plant_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;