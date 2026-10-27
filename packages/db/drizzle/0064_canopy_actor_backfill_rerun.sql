-- API containers that predate 0063 keep inserting plants and care logs
-- without the actor columns until the rollout replaces them. This reruns
-- the 0063 actor backfill over those rows. No DDL here, so EXCLUSIVE keeps plain
-- reads flowing while it blocks every writer and row locker of plants and
-- care_logs; the users lock covers the foreign-key checks on the new
-- values. Locks are taken the 0063 way, never waiting while holding one.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$
DECLARE
  attempts integer := 0;
BEGIN
  LOOP
    BEGIN
      LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      LOCK TABLE "care_logs", "plants" IN EXCLUSIVE MODE NOWAIT;
      EXIT;
    EXCEPTION
      WHEN lock_not_available THEN
        attempts := attempts + 1;
        IF attempts >= 200 THEN
          RAISE;
        END IF;
        PERFORM pg_sleep(0.05);
    END;
  END LOOP;
END $$;
--> statement-breakpoint
UPDATE "plants"
SET "created_by_user_id" = "user_id"
WHERE "created_by_user_id" IS NULL
  AND "user_id" IS NOT NULL;
--> statement-breakpoint
WITH "accepted_delegations" AS (
  SELECT
    "id",
    "caretaker_id",
    "start_date" AS "covered_from",
    LEAST("end_date", "canceled_at", "completed_at") AS "covered_until"
  FROM "care_delegations"
  WHERE "status" IN ('active', 'completed')
    OR ("status" = 'canceled' AND "responded_at" IS NOT NULL)
),
"latest_covering_caretaker" AS (
  SELECT DISTINCT ON (l."id") l."id" AS "care_log_id", d."caretaker_id"
  FROM "care_logs" l
  JOIN "delegation_plants" dp ON dp."plant_id" = l."plant_id"
  JOIN "accepted_delegations" d ON d."id" = dp."delegation_id"
  WHERE l."performed_by_user_id" IS NULL
    AND l."date" >= d."covered_from"
    AND l."date" < d."covered_until"
  ORDER BY l."id", d."covered_from" DESC, d."id"
)
UPDATE "care_logs" cl
SET "performed_by_user_id" = c."caretaker_id"
FROM "latest_covering_caretaker" c
WHERE cl."id" = c."care_log_id";
--> statement-breakpoint
UPDATE "care_logs" cl
SET "performed_by_user_id" = p."user_id"
FROM "plants" p
WHERE p."id" = cl."plant_id"
  AND cl."performed_by_user_id" IS NULL
  AND p."user_id" IS NOT NULL;
