CREATE TABLE IF NOT EXISTS "rare_plant_identifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "image_url" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rare_plant_identifications_user_image_idx" ON "rare_plant_identifications" ("user_id", "image_url");
