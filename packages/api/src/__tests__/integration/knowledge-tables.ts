import { fileURLToPath } from 'node:url'

export const claimsMigration = fileURLToPath(
  new URL(
    '../../../../knowledge-db/drizzle/0005_ingest_job_claims.sql',
    import.meta.url
  )
)

// The pieces of knowledge-db migration 0000 that ingestion touches, from
// before 0005. The real file declares processed_chunks.embedding as halfvec,
// which needs pgvector, and CI's Postgres has none, so it is text here.
export const knowledgeTables = `
  CREATE TYPE "ingest_job_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');
  CREATE TYPE "content_category" AS ENUM('watering_advice', 'pest_identification', 'disease_diagnosis', 'light_requirements', 'soil_nutrients', 'propagation', 'general_care');
  CREATE TABLE "ingest_jobs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "adapter" text NOT NULL,
    "config" jsonb NOT NULL,
    "status" "ingest_job_status" DEFAULT 'pending' NOT NULL,
    "documents_fetched" integer DEFAULT 0 NOT NULL,
    "chunks_created" integer DEFAULT 0 NOT NULL,
    "cursor" text,
    "error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE "raw_documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "source" text NOT NULL,
    "source_url" text,
    "source_id" text,
    "title" text NOT NULL,
    "content" text NOT NULL,
    "author" text,
    "score" integer,
    "metadata" jsonb,
    "ingest_job_id" uuid NOT NULL REFERENCES "ingest_jobs"("id") ON DELETE cascade,
    "fetched_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE INDEX "raw_documents_source_id_idx" ON "raw_documents" ("source_id");
  CREATE TABLE "processed_chunks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "document_id" uuid NOT NULL REFERENCES "raw_documents"("id") ON DELETE cascade,
    "parent_chunk_id" uuid REFERENCES "processed_chunks"("id") ON DELETE cascade,
    "content" text NOT NULL,
    "chunk_index" integer NOT NULL,
    "source" text NOT NULL,
    "plant_type" text,
    "category" "content_category",
    "plant_mentions" jsonb,
    "metadata" jsonb,
    "embedding_content" text,
    "embedding" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
`
