ALTER TABLE "plants" DROP COLUMN IF EXISTS "pot_size";--> statement-breakpoint
ALTER TABLE "plants" ADD COLUMN "pot_width_cm" double precision;--> statement-breakpoint
ALTER TABLE "plants" ADD COLUMN "pot_height_cm" double precision;
