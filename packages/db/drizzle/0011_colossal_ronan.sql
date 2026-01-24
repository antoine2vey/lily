ALTER TABLE "user_achievements" ALTER COLUMN "unlocked_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_achievements" ALTER COLUMN "unlocked_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "dead_letter_messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dead_letter_messages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "dead_letter_messages" ALTER COLUMN "failed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dead_letter_messages" ALTER COLUMN "failed_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "device_tokens" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_tokens" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "device_tokens" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_tokens" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "scheduled_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "sent_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "care_logs" ALTER COLUMN "date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "care_logs" ALTER COLUMN "date" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "care_logs" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "care_logs" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "care_logs" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "care_logs" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "plant_photos" ALTER COLUMN "taken_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plant_photos" ALTER COLUMN "taken_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "plant_scans" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plant_scans" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "date_added" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "date_added" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "last_watered_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "next_watering_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "last_fertilized_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "next_fertilization_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_events" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_events" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "subscription_usage" ALTER COLUMN "period_start" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_usage" ALTER COLUMN "period_end" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_usage" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_usage" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "subscription_usage" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_usage" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "trial_starts_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "trial_ends_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "current_period_start" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "current_period_end" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "canceled_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "parts" jsonb;