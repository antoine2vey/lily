ALTER TABLE "users" ADD COLUMN "care_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "weekly_digest" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "achievement_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tips" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "product_updates" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "do_not_disturb" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "do_not_disturb_start" text DEFAULT '22:00';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "do_not_disturb_end" text DEFAULT '07:00';--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "soil_alerts";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "watering_reminders";