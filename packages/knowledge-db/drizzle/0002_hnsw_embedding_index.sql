CREATE INDEX IF NOT EXISTS "processed_chunks_embedding_hnsw_idx" ON "processed_chunks" USING hnsw ("embedding" halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
