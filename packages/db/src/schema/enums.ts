import { pgEnum } from 'drizzle-orm/pg-core'

export const careLogTypeEnum = pgEnum('care_log_type', [
  'watering',
  'fertilization',
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
