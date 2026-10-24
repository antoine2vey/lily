-- Handles are unique regardless of case. If existing rows already collide
-- case-insensitively the index is skipped (and reported) rather than failing
-- the deploy; the API's case-insensitive check still blocks new collisions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE "name" IS NOT NULL
    GROUP BY lower("name")
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'users_name_lower_unique skipped: handles collide case-insensitively';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "users_name_lower_unique" ON "users" (lower("name"));
  END IF;
END $$;
