-- A worker claims a job by setting claimed_at and refreshes it after each
-- document. A job still in_progress whose claim is older than the worker's
-- timeout has no live worker and is put back to pending.
ALTER TABLE "ingest_jobs"
  ADD COLUMN "claimed_at" timestamp with time zone;

-- Two workers fetching the same post at the same time must store it once.
-- Rows that exist before this migration may already repeat a source_id and
-- are left alone, so the index covers only rows fetched from now on. The
-- cutoff is the time this file runs; an index predicate must be a constant.
DO $$
BEGIN
  EXECUTE format(
    'CREATE UNIQUE INDEX "raw_documents_source_id_unique" ON "raw_documents" ("source_id") WHERE "source_id" IS NOT NULL AND "fetched_at" >= %L',
    now()
  );
END $$;
