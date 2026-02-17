CREATE TYPE "public"."delegation_status" AS ENUM('pending', 'accepted', 'rejected', 'active', 'completed', 'canceled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "care_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"caretaker_id" uuid NOT NULL,
	"status" "delegation_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delegation_plants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delegation_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_nudges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "image_key" text;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD COLUMN IF NOT EXISTS "image_key" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'care_delegations_owner_id_users_id_fk') THEN
    ALTER TABLE "care_delegations" ADD CONSTRAINT "care_delegations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'care_delegations_caretaker_id_users_id_fk') THEN
    ALTER TABLE "care_delegations" ADD CONSTRAINT "care_delegations_caretaker_id_users_id_fk" FOREIGN KEY ("caretaker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delegation_plants_delegation_id_care_delegations_id_fk') THEN
    ALTER TABLE "delegation_plants" ADD CONSTRAINT "delegation_plants_delegation_id_care_delegations_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."care_delegations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delegation_plants_plant_id_plants_id_fk') THEN
    ALTER TABLE "delegation_plants" ADD CONSTRAINT "delegation_plants_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_follows_follower_id_users_id_fk') THEN
    ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_follows_following_id_users_id_fk') THEN
    ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_nudges_from_user_id_users_id_fk') THEN
    ALTER TABLE "user_nudges" ADD CONSTRAINT "user_nudges_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_nudges_to_user_id_users_id_fk') THEN
    ALTER TABLE "user_nudges" ADD CONSTRAINT "user_nudges_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delegation_plants_delegation_plant_idx" ON "delegation_plants" USING btree ("delegation_id","plant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_follows_follower_following_idx" ON "user_follows" USING btree ("follower_id","following_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_nudges_from_user_id_idx" ON "user_nudges" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_nudges_to_user_id_idx" ON "user_nudges" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_user_plant_idx" ON "chat_messages" USING btree ("user_id","plant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "care_logs_plant_id_idx" ON "care_logs" USING btree ("plant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plant_scans_user_id_idx" ON "plant_scans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plants_user_id_idx" ON "plants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plants_room_id_idx" ON "plants" USING btree ("room_id");--> statement-breakpoint
ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "image_url";--> statement-breakpoint
ALTER TABLE "diagnoses" DROP COLUMN IF EXISTS "image_url";
