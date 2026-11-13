-- Transactional outbox: events a context commits with its writes, delivered
-- at least once to each consumer by the relay in packages/api/src/kernel.
CREATE TABLE IF NOT EXISTS "outbox" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "topic" text NOT NULL,
  "event" jsonb NOT NULL,
  "pending_consumers" text[] NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone NOT NULL,
  "claimed_until" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_ready_idx" ON "outbox" ("available_at", "id") WHERE processed_at IS NULL;
