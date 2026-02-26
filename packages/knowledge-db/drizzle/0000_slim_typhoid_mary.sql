CREATE TYPE "public"."content_category" AS ENUM('watering_advice', 'pest_identification', 'disease_diagnosis', 'light_requirements', 'soil_nutrients', 'propagation', 'general_care');--> statement-breakpoint
CREATE TYPE "public"."ingest_job_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "processed_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"source" text NOT NULL,
	"plant_type" text,
	"category" "content_category",
	"plant_mentions" jsonb,
	"embedding" halfvec(3072),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"ingest_job_id" uuid NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processed_chunks" ADD CONSTRAINT "processed_chunks_document_id_raw_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."raw_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_documents" ADD CONSTRAINT "raw_documents_ingest_job_id_ingest_jobs_id_fk" FOREIGN KEY ("ingest_job_id") REFERENCES "public"."ingest_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processed_chunks_document_id_idx" ON "processed_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "processed_chunks_plant_type_idx" ON "processed_chunks" USING btree ("plant_type");--> statement-breakpoint
CREATE INDEX "raw_documents_source_id_idx" ON "raw_documents" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "raw_documents_ingest_job_id_idx" ON "raw_documents" USING btree ("ingest_job_id");