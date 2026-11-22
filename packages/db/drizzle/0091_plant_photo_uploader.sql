SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "plant_photos" ADD COLUMN IF NOT EXISTS "uploaded_by_user_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "plant_photos" ADD CONSTRAINT "plant_photos_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plant_photos_uploaded_by_user_id_idx" ON "plant_photos" USING btree ("uploaded_by_user_id");
