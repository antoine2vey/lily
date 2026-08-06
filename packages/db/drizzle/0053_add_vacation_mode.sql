-- Vacation mode: users can pause care/engagement notifications for a date
-- range. Status 'scheduled' -> 'active' -> 'none' is driven by the
-- vacation-scheduler; care schedules are shifted forward when it ends.
DO $$ BEGIN
  CREATE TYPE "user_vacation_status" AS ENUM ('none', 'scheduled', 'active');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "vacation_status" "user_vacation_status" NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "vacation_start" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "vacation_end" timestamp with time zone;
--> statement-breakpoint
-- Partial index keeps the 5-minute vacation-scheduler poll cheap: almost all
-- rows are 'none' and never match.
CREATE INDEX IF NOT EXISTS "users_vacation_status_idx" ON "users" ("vacation_status") WHERE "vacation_status" <> 'none';
