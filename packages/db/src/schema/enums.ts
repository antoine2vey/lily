import { pgEnum } from 'drizzle-orm/pg-core'

export const careLogTypeEnum = pgEnum('care_log_type', [
  'watering',
  'fertilization',
  'misting',
  'repotting',
])

export const notificationStatusEnum = pgEnum('notification_status', [
  'pending',
  'queued',
  'sent',
  'failed',
])

export const plantHealthEnum = pgEnum('plant_health', [
  'THRIVING',
  'HEALTHY',
  'NEEDS_ATTENTION',
  'SICK',
  'RECOVERING',
])

export const achievementKeyEnum = pgEnum('achievement_key', [
  'FIRST_PLANT_ADDED',
  'WATERING_NOVICE',
  'PLANT_COLLECTOR',
  'DEDICATED_CARETAKER',
  'ATTENTION_ALERT',
  'PHOTO_PRO',
  'RARE_COLLECTOR',
  'SCAN_CHAMP',
  'FERTILIZER_GURU',
  'HISTORY_HERO',
  'AI_CONVERSATIONALIST',
  'DISEASE_DETECTIVE',
  'GROWTH_TRACKER',
  'REMINDER_RESCUER',
  'SHARE_SPROUT',
])

export const userRoleEnum = pgEnum('user_role', ['user', 'admin'])

export const userStatusEnum = pgEnum('user_status', [
  'active',
  'suspended',
  'banned',
  'pending_deletion',
])

export const diagnosisSeverityEnum = pgEnum('diagnosis_severity', [
  'LOW',
  'MODERATE',
  'HIGH',
  'CRITICAL',
])

export const diagnosisStatusEnum = pgEnum('diagnosis_status', [
  'ACTIVE',
  'RESOLVED',
])

export const delegationStatusEnum = pgEnum('delegation_status', [
  'pending',
  'accepted',
  'rejected',
  'active',
  'completed',
  'canceled',
])

export const languageCodeEnum = pgEnum('language_code', ['en', 'fr'])

export const careTypeEnum = pgEnum('care_type', [
  'watering',
  'fertilization',
  'misting',
  'repotting',
])

export const temperatureUnitEnum = pgEnum('temperature_unit', [
  'celsius',
  'fahrenheit',
])

export const blogPostStatusEnum = pgEnum('blog_post_status', [
  'pending',
  'researching',
  'generating',
  'reviewing',
  'published',
  'rejected',
])

export const scanTypeEnum = pgEnum('scan_type', ['card', 'identify'])

export const devicePlatformEnum = pgEnum('device_platform', [
  'ios',
  'android',
  'web',
])

// iOS Live Activity push tokens come in two shapes:
//   - `start`  = push-to-start token (one per device, rotates; used to *start*
//                an activity remotely on iOS 17.2+)
//   - `update` = per-activity token (one per running activity; used to update
//                or end it)
export const activityTokenKindEnum = pgEnum('activity_token_kind', [
  'start',
  'update',
])

export const activityStatusEnum = pgEnum('activity_status', [
  'active',
  'ended',
  'expired',
])
