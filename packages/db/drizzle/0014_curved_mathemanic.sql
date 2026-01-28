ALTER TABLE "users" ADD COLUMN "public_profile" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "share_growth_data" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "personalized_tips" boolean DEFAULT true NOT NULL;