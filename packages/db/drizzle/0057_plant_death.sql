-- Plant cemetery: a dead plant keeps its rows (history, photos, schedules)
-- but is excluded from every care/notification path via `died_at IS NULL`.
-- Death is reversible ("bring back" nulls the three columns), so nothing
-- here cascades or archives.
CREATE TYPE "plant_death_cause" AS ENUM (
  'overwatering',
  'underwatering',
  'pests',
  'disease',
  'light',
  'cold',
  'heat',
  'repotting_shock',
  'unknown'
);
ALTER TABLE "plants" ADD COLUMN IF NOT EXISTS "died_at" timestamp with time zone;
ALTER TABLE "plants" ADD COLUMN IF NOT EXISTS "death_cause" "plant_death_cause";
ALTER TABLE "plants" ADD COLUMN IF NOT EXISTS "death_note" text;
-- Living-plants lookups per user are the hot path (list, care tasks,
-- reminders); the partial index keeps them cheap as cemeteries grow.
CREATE INDEX IF NOT EXISTS "plants_user_id_living_idx" ON "plants" ("user_id") WHERE "died_at" IS NULL;
