import {
  AchievementRepository,
  type IAchievementRepository,
} from '@lily/api/repositories/achievement.repository'
import type { userAchievements } from '@lily/db'
import type { AchievementKey } from '@lily/shared'
import { Effect, Layer } from 'effect'

type UserAchievement = typeof userAchievements.$inferSelect

export interface MockAchievementRepositoryData {
  achievements: UserAchievement[]
  plantCount?: number
  careLogCounts?: { watering: number; fertilization: number }
  photoCount?: number
  careStreak?: number
  scanCount?: number
  plantPhotoCount?: number
  historyViewCount?: number
}

export const createMockAchievementRepository = (
  data: MockAchievementRepositoryData
): Layer.Layer<AchievementRepository> => {
  const unlockedAchievements = [...data.achievements]

  const repo: IAchievementRepository = {
    findByUserId: (userId: string) =>
      Effect.succeed(unlockedAchievements.filter((a) => a.userId === userId)),

    hasAchievement: (userId: string, key: AchievementKey) =>
      Effect.succeed(
        unlockedAchievements.some(
          (a) => a.userId === userId && a.achievement === key
        )
      ),

    unlock: (userId: string, key: AchievementKey) => {
      const existing = unlockedAchievements.find(
        (a) => a.userId === userId && a.achievement === key
      )
      if (existing) {
        return Effect.succeed(null)
      }
      const newAchievement: UserAchievement = {
        id: `ach-${crypto.randomUUID()}`,
        userId,
        achievement: key,
        unlockedAt: new Date(),
      }
      unlockedAchievements.push(newAchievement)
      return Effect.succeed(newAchievement)
    },

    countCareLogsByType: (
      _userId: string,
      type: 'watering' | 'fertilization'
    ) => Effect.succeed(data.careLogCounts?.[type] ?? 0),

    countPlants: (_userId: string) => Effect.succeed(data.plantCount ?? 0),

    countPhotos: (_userId: string) => Effect.succeed(data.photoCount ?? 0),

    getCareStreak: (_userId: string) => Effect.succeed(data.careStreak ?? 0),

    countScans: (_userId: string) => Effect.succeed(data.scanCount ?? 0),

    countPhotosForPlant: (_userId: string, _plantId: string) =>
      Effect.succeed(data.plantPhotoCount ?? 0),

    incrementHistoryViews: (_userId: string) => {
      const currentCount = data.historyViewCount ?? 0
      data.historyViewCount = currentCount + 1
      return Effect.succeed(data.historyViewCount)
    },

    getHistoryViewCount: (_userId: string) =>
      Effect.succeed(data.historyViewCount ?? 0),
  }

  return Layer.succeed(AchievementRepository, repo)
}
