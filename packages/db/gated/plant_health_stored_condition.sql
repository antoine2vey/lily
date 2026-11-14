-- GATED: the migrator applies packages/db/drizzle only, so this file does
-- nothing where it is. Follow packages/db/gated/README.md before it moves
-- into packages/db/drizzle as the next numbered migration.
--
-- Must be true before it runs: no process of a release older than 0070 is
-- left, and none will come back. Such a process still runs the health
-- scheduler, which stores NEEDS_ATTENTION, and that write fails once the
-- type no longer has the value.
--
-- It deletes no row. It rewrites the health column of plants under an
-- ACCESS EXCLUSIVE lock, which lock_timeout bounds the wait for.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- A row an older process marked after 0070 goes back to HEALTHY, as in 0070.
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
