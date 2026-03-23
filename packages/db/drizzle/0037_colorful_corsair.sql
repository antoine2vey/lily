CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android', 'web');--> statement-breakpoint
CREATE TYPE "public"."scan_type" AS ENUM('card', 'identify');--> statement-breakpoint
ALTER TYPE "public"."subscription_event_type" ADD VALUE 'subscription_gifted' BEFORE 'trial_started';--> statement-breakpoint
DROP INDEX "notifications_status_idx";--> statement-breakpoint
ALTER TABLE "device_tokens" ALTER COLUMN "platform" SET DATA TYPE "public"."device_platform" USING "platform"::"public"."device_platform";--> statement-breakpoint
ALTER TABLE "plant_scans" ALTER COLUMN "scan_type" SET DATA TYPE "public"."scan_type" USING "scan_type"::"public"."scan_type";--> statement-breakpoint
CREATE INDEX "notifications_status_scheduled_at_idx" ON "notifications" USING btree ("status","scheduled_at");