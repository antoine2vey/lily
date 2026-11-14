-- "Needs attention" is derived from overdue care at read time and is no
-- longer stored. Rows the retired health scheduler marked go back to the
-- condition it marked them from.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
UPDATE "plants" SET "health" = 'HEALTHY' WHERE "health" = 'NEEDS_ATTENTION';
