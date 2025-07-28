import { Schema } from 'effect'

// Achievement schemas
export const AchievementKey = Schema.Union(
  Schema.Literal('first_plant'),
  Schema.Literal('plant_whisperer'),
  Schema.Literal('green_thumb'),
  Schema.Literal('consistent_carer'),
  Schema.Literal('plant_collector'),
  Schema.Literal('ai_assistant'),
  Schema.Literal('perfect_week'),
  Schema.Literal('plant_photographer'),
  Schema.Literal('early_adopter'),
  Schema.Literal('plant_expert')
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
