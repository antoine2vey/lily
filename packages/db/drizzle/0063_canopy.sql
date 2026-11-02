-- Live traffic locks care_logs then plants (care) and plants then care_logs
-- (plant delete), so any fixed lock order can deadlock with one of them.
-- Take every lock this file needs without ever waiting while holding one:
-- a failed NOWAIT attempt rolls back its savepoint and releases what it got.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$
DECLARE
  attempts integer := 0;
BEGIN
  LOOP
    BEGIN
      LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE "care_logs", "plants", "rooms" IN ACCESS EXCLUSIVE MODE NOWAIT;
      EXIT;
    EXCEPTION
      WHEN lock_not_available THEN
        attempts := attempts + 1;
        IF attempts >= 200 THEN
          RAISE;
        END IF;
        PERFORM pg_sleep(0.05);
    END;
  END LOOP;
END $$;
--> statement-breakpoint
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
	"canopy_id" uuid NOT NULL CONSTRAINT "canopy_members_canopy_id_canopies_id_fk" REFERENCES "canopies"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL CONSTRAINT "canopy_members_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE CASCADE,
	"role" "canopy_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canopy_members_user_id_unique" ON "canopy_members" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canopy_members_one_owner_unique" ON "canopy_members" USING btree ("canopy_id") WHERE "role" = 'owner';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canopy_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canopy_id" uuid NOT NULL CONSTRAINT "canopy_invites_canopy_id_canopies_id_fk" REFERENCES "canopies"("id") ON DELETE CASCADE,
	"token_hash" text NOT NULL,
	"created_by_user_id" uuid CONSTRAINT "canopy_invites_created_by_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE SET NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canopy_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canopy_invites_one_live_unique" ON "canopy_invites" USING btree ("canopy_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canopy_plant_mutes" (
	"user_id" uuid NOT NULL CONSTRAINT "canopy_plant_mutes_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE CASCADE,
	"plant_id" uuid NOT NULL CONSTRAINT "canopy_plant_mutes_plant_id_plants_id_fk" REFERENCES "plants"("id") ON DELETE CASCADE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canopy_plant_mutes_user_id_plant_id_pk" PRIMARY KEY("user_id","plant_id")
);
--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "plants" ADD COLUMN IF NOT EXISTS "canopy_id" uuid CONSTRAINT "plants_canopy_id_canopies_id_fk" REFERENCES "canopies"("id") ON DELETE RESTRICT;
--> statement-breakpoint
-- The actor columns get their foreign keys after the backfill: one
-- validation pass is far cheaper than a lookup per updated row.
ALTER TABLE "plants" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
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
UPDATE "plants"
SET "created_by_user_id" = "user_id"
WHERE "created_by_user_id" IS NULL
  AND "user_id" IS NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "plants" ADD CONSTRAINT "plants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plants_created_by_user_id_idx" ON "plants" USING btree ("created_by_user_id");
--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "canopy_id" uuid CONSTRAINT "rooms_canopy_id_canopies_id_fk" REFERENCES "canopies"("id") ON DELETE RESTRICT;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "rooms" ADD CONSTRAINT "rooms_one_owner" CHECK (num_nonnulls("user_id", "canopy_id") = 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "care_logs" ADD COLUMN IF NOT EXISTS "performed_by_user_id" uuid;
--> statement-breakpoint
WITH "accepted_delegations" AS (
  SELECT
    "id",
    "caretaker_id",
    "start_date" AS "covered_from",
    LEAST("end_date", "canceled_at", "completed_at") AS "covered_until"
  FROM "care_delegations"
  WHERE "status" IN ('active', 'completed')
    OR ("status" = 'canceled' AND "responded_at" IS NOT NULL)
),
"latest_covering_caretaker" AS (
  SELECT DISTINCT ON (l."id") l."id" AS "care_log_id", d."caretaker_id"
  FROM "care_logs" l
  JOIN "delegation_plants" dp ON dp."plant_id" = l."plant_id"
  JOIN "accepted_delegations" d ON d."id" = dp."delegation_id"
  WHERE l."performed_by_user_id" IS NULL
    AND l."date" >= d."covered_from"
    AND l."date" < d."covered_until"
  ORDER BY l."id", d."covered_from" DESC, d."id"
)
UPDATE "care_logs" cl
SET "performed_by_user_id" = c."caretaker_id"
FROM "latest_covering_caretaker" c
WHERE cl."id" = c."care_log_id";
--> statement-breakpoint
UPDATE "care_logs" cl
SET "performed_by_user_id" = p."user_id"
FROM "plants" p
WHERE p."id" = cl."plant_id"
  AND cl."performed_by_user_id" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "care_logs_performed_by_user_id_idx" ON "care_logs" USING btree ("performed_by_user_id");
