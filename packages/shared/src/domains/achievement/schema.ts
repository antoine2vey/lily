import { Schema } from 'effect'

// Achievement key enum - synced with DB achievementKeyEnum
export const AchievementKey = Schema.Union(
  Schema.Literal('FIRST_PLANT_ADDED'),
  Schema.Literal('WATERING_NOVICE'),
  Schema.Literal('PLANT_COLLECTOR'),
  Schema.Literal('DEDICATED_CARETAKER'),
  Schema.Literal('ATTENTION_ALERT'),
  Schema.Literal('PHOTO_PRO'),
  Schema.Literal('RARE_COLLECTOR'),
  Schema.Literal('SCAN_CHAMP'),
  Schema.Literal('FERTILIZER_GURU'),
  Schema.Literal('HISTORY_HERO'),
  Schema.Literal('AI_CONVERSATIONALIST'),
  Schema.Literal('DISEASE_DETECTIVE'),
  Schema.Literal('GROWTH_TRACKER'),
  Schema.Literal('REMINDER_RESCUER'),
  Schema.Literal('SHARE_SPROUT')
)

export const Achievement = Schema.Struct({
  id: Schema.String,
  key: AchievementKey,
  name: Schema.String,
  description: Schema.String,
  iconUrl: Schema.String,
  unlockedAt: Schema.Date,
  userId: Schema.String,
})

export const UnlockAchievementRequest = Schema.Struct({
  achievement: AchievementKey,
})

// Type exports
export type AchievementKey = typeof AchievementKey.Type
export type Achievement = typeof Achievement.Type
export type UnlockAchievementRequest = typeof UnlockAchievementRequest.Type
