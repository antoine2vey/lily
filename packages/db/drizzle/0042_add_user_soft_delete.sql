ALTER TYPE "public"."user_status" ADD VALUE 'pending_deletion';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;