CREATE TABLE IF NOT EXISTS "chat_follow_up_sets" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plant_id" uuid NOT NULL REFERENCES "plants"("id") ON DELETE CASCADE,
  "language" text NOT NULL,
  "requested_at" timestamp with time zone,
  "claimed_until" timestamp with time zone,
  "generated_at" timestamp with time zone,
  "follow_ups" jsonb DEFAULT '[]'::jsonb NOT NULL,
  CONSTRAINT "chat_follow_up_sets_pkey" PRIMARY KEY ("user_id", "plant_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_follow_up_sets_requested_idx" ON "chat_follow_up_sets" ("requested_at") WHERE "requested_at" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_follow_up_sets_plant_idx" ON "chat_follow_up_sets" ("plant_id");
