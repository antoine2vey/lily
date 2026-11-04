SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "notification_type" AS ENUM (
    'watering_reminder',
    'fertilization_reminder',
    'misting_reminder',
    'repotting_reminder',
    'overdue_reminder',
    'new_follower',
    'nudge_to_water',
    'delegation_request',
    'delegation_accepted',
    'delegation_rejected',
    'delegation_canceled',
    'delegation_activated',
    'delegation_completed',
    'canopy_member_joined',
    'canopy_member_removed',
    'canopy_member_left',
    'canopy_invitation',
    'daily_tip',
    'inactivity_nudge',
    'photo_reminder',
    'plant_parent_milestone',
    'gift_subscription',
    'resubscribe_nudge',
    'streak_at_risk',
    'streak_milestone',
    'weekly_recap',
    'trial_ending',
    'approaching_limit',
    'plant_anniversary'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
UPDATE "notifications" SET "type" = 'daily_tip' WHERE "type"::text = 'plant_tip';
--> statement-breakpoint
DELETE FROM "notifications"
WHERE "type"::text NOT IN (SELECT unnest(enum_range(NULL::"notification_type"))::text);
--> statement-breakpoint
ALTER TABLE "notifications"
  ALTER COLUMN "type" SET DATA TYPE "notification_type"
  USING "type"::"notification_type";
