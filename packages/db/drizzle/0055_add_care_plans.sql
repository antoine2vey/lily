-- AI care plans: one-off, ordered checklists proposed by the chat assistant
-- for a single plant. Steps carrying a care_type bridge into the recurring
-- schedule model (accept moves next_care_at, completion runs the care flow).
DO $$ BEGIN
  CREATE TYPE "care_plan_status" AS ENUM ('proposed', 'accepted', 'completed', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "care_plan_source" AS ENUM ('ai', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "care_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plant_id" uuid NOT NULL REFERENCES "plants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chat_message_id" uuid REFERENCES "chat_messages"("id") ON DELETE SET NULL,
  "diagnosis_id" uuid REFERENCES "diagnoses"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "source" "care_plan_source" NOT NULL DEFAULT 'ai',
  "status" "care_plan_status" NOT NULL DEFAULT 'proposed',
  "accepted_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "care_plans_user_status_idx" ON "care_plans" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "care_plans_plant_id_idx" ON "care_plans" ("plant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "care_plan_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "care_plans"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "care_type" "care_type",
  "due_date" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "care_log_id" uuid REFERENCES "care_logs"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "care_plan_steps_plan_id_idx" ON "care_plan_steps" ("plan_id");
