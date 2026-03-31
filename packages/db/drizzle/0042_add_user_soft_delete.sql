ALTER TYPE "public"."user_status" ADD VALUE 'pending_deletion';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX idx_users_pending_deletion ON "users" ("status", "deleted_at") WHERE "status" = 'pending_deletion';