CREATE TYPE "public"."language_code" AS ENUM('en', 'fr');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "language" "language_code" DEFAULT 'en' NOT NULL;