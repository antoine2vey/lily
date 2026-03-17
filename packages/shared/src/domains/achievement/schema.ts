import { Schema } from 'effect'

// Achievement key enum - synced with DB achievementKeyEnum
export const AchievementKey = Schema.Literal(
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
  'SHARE_SPROUT'
)

export const AchievementCategory = Schema.Literal(
  'plants',
  'care',
  'streaks',
  'special'
)

export const AchievementRarity = Schema.Literal(
  'common',
  'rare',
  'epic',
  'legendary'
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
