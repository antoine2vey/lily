CREATE TYPE "public"."app_store" AS ENUM('APP_STORE', 'PLAY_STORE');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('revenuecat');--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "provider" SET DEFAULT 'revenuecat'::"public"."payment_provider";--> statement-breakpoint
ALTER TABLE "user_subscriptions" ALTER COLUMN "provider" SET DATA TYPE "public"."payment_provider" USING "provider"::"public"."payment_provider";--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "product_id" text;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "store" "app_store";