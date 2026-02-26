-- Self-referential parent_chunk_id for parent-child chunking
ALTER TABLE "processed_chunks"
  ADD COLUMN "parent_chunk_id" uuid
  REFERENCES "processed_chunks"("id") ON DELETE CASCADE;

CREATE INDEX "processed_chunks_parent_chunk_id_idx"
  ON "processed_chunks"("parent_chunk_id");

-- FTS generated column (PostgreSQL 17 — auto-maintained)
ALTER TABLE "processed_chunks"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX "processed_chunks_search_vector_idx"
  ON "processed_chunks" USING gin("search_vector");
