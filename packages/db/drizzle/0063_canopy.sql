-- Canopy: a shared household. A plant or room belongs to exactly one owner,
-- a user or a Canopy. Every statement is additive and safe to rerun, and the
-- old API keeps working because it always writes user_id.
DO $$
BEGIN
  CREATE TYPE "canopy_member_role" AS ENUM ('owner', 'member');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canopies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canopy_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canopy_id" uuid NOT NULL REFERENCES "canopies"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"role" "canopy_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- One Canopy per user. Drop this index if several Canopies per user ship.
CREATE UNIQUE INDEX IF NOT EXISTS "canopy_members_user_id_unique" ON "canopy_members" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canopy_members_one_owner_unique" ON "canopy_members" USING btree ("canopy_id") WHERE "role" = 'owner';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canopy_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canopy_id" uuid NOT NULL REFERENCES "canopies"("id") ON DELETE CASCADE,
	"token_hash" text NOT NULL,
	"created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canopy_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canopy_invites_one_live_unique" ON "canopy_invites" USING btree ("canopy_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canopy_plant_mutes" (
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"plant_id" uuid NOT NULL REFERENCES "plants"("id") ON DELETE CASCADE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canopy_plant_mutes_user_id_plant_id_pk" PRIMARY KEY("user_id","plant_id")
);
--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "plants" ADD COLUMN IF NOT EXISTS "canopy_id" uuid REFERENCES "canopies"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "plants" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "plants" ADD CONSTRAINT "plants_one_owner" CHECK (num_nonnulls("user_id", "canopy_id") = 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plants_canopy_id_living_idx" ON "plants" USING btree ("canopy_id") WHERE "died_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plants_created_by_user_id_idx" ON "plants" USING btree ("created_by_user_id");
--> statement-breakpoint
-- Every existing plant was created by its owner.
UPDATE "plants"
SET "created_by_user_id" = "user_id"
WHERE "created_by_user_id" IS NULL
  AND "user_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "canopy_id" uuid REFERENCES "canopies"("id") ON DELETE RESTRICT;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "rooms" ADD CONSTRAINT "rooms_one_owner" CHECK (num_nonnulls("user_id", "canopy_id") = 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "care_logs" ADD COLUMN IF NOT EXISTS "performed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "care_logs_performed_by_user_id_idx" ON "care_logs" USING btree ("performed_by_user_id");
--> statement-breakpoint
-- A log written while a delegation covered the plant was done by the
-- caretaker. A delegation covered it only once accepted (active, completed,
-- or canceled after acceptance), from start_date until it ended or was
-- canceled. Overlaps go to the latest-started delegation. Logs of deleted
-- delegations fall back to the plant owner.
UPDATE "care_logs" cl
SET "performed_by_user_id" = COALESCE(
  (
    SELECT d."caretaker_id"
    FROM "delegation_plants" dp
    JOIN "care_delegations" d ON d."id" = dp."delegation_id"
    WHERE dp."plant_id" = cl."plant_id"
      AND (
        d."status" IN ('active', 'completed')
        OR (d."status" = 'canceled' AND d."responded_at" IS NOT NULL)
      )
      AND cl."date" >= d."start_date"
      AND cl."date" <= LEAST(d."end_date", COALESCE(d."canceled_at", d."end_date"))
    ORDER BY d."start_date" DESC
    LIMIT 1
  ),
  p."user_id"
)
FROM "plants" p
WHERE p."id" = cl."plant_id"
  AND cl."performed_by_user_id" IS NULL;
