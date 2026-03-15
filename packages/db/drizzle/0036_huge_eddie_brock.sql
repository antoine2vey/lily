CREATE TYPE "public"."temperature_unit" AS ENUM('celsius', 'fahrenheit');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "temperature_unit" "temperature_unit" DEFAULT 'celsius' NOT NULL;