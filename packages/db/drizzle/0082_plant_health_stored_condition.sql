SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
UPDATE "plants" SET "health" = 'HEALTHY' WHERE "health" = 'NEEDS_ATTENTION';
--> statement-breakpoint
-- Postgres cannot drop a value from an enum, so the type is replaced.
ALTER TABLE "plants" ALTER COLUMN "health" DROP DEFAULT;
--> statement-breakpoint
ALTER TYPE "public"."plant_health" RENAME TO "plant_health_before_derived";
--> statement-breakpoint
CREATE TYPE "public"."plant_health" AS ENUM('THRIVING', 'HEALTHY', 'SICK', 'RECOVERING');
--> statement-breakpoint
ALTER TABLE "plants"
  ALTER COLUMN "health" TYPE "public"."plant_health"
  USING "health"::text::"public"."plant_health";
--> statement-breakpoint
ALTER TABLE "plants" ALTER COLUMN "health" SET DEFAULT 'HEALTHY';
--> statement-breakpoint
DROP TYPE "public"."plant_health_before_derived";
