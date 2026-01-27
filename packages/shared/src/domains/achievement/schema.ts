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

export const AchievementCategory = Schema.Union(
  Schema.Literal('plants'),
  Schema.Literal('care'),
  Schema.Literal('streaks'),
  Schema.Literal('special')
)

export const AchievementRarity = Schema.Union(
  Schema.Literal('common'),
  Schema.Literal('rare'),
  Schema.Literal('epic'),
  Schema.Literal('legendary')
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

export const AchievementWithProgress = Schema.Struct({
  key: AchievementKey,
  name: Schema.String,
  description: Schema.String,
  icon: Schema.String,
  category: AchievementCategory,
  rarity: AchievementRarity,
  unlocked: Schema.Boolean,
  unlockedAt: Schema.NullOr(Schema.Date),
  progress: Schema.NullOr(Schema.Number),
  maxProgress: Schema.NullOr(Schema.Number),
})

export const AchievementsResponse = Schema.Struct({
  achievements: Schema.Array(AchievementWithProgress),
  level: Schema.Number,
  unlockedCount: Schema.Number,
  totalCount: Schema.Number,
})

export const UnlockAchievementRequest = Schema.Struct({
  achievement: AchievementKey,
})

// Type exports
export type AchievementKey = typeof AchievementKey.Type
export type AchievementCategory = typeof AchievementCategory.Type
export type AchievementRarity = typeof AchievementRarity.Type
export type Achievement = typeof Achievement.Type
export type AchievementWithProgress = typeof AchievementWithProgress.Type
export type AchievementsResponse = typeof AchievementsResponse.Type
export type UnlockAchievementRequest = typeof UnlockAchievementRequest.Type
