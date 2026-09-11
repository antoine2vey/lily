-- Diagnoses are no longer "resolved" by hand: the treatment lives on as a
-- care plan whose completion is the meaningful signal. Drop the manual
-- status column, its timestamp and the now-unused enum.
ALTER TABLE "diagnoses" DROP COLUMN IF EXISTS "status";
--> statement-breakpoint
ALTER TABLE "diagnoses" DROP COLUMN IF EXISTS "resolved_at";
--> statement-breakpoint
DROP TYPE IF EXISTS "diagnosis_status";
