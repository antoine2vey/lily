import {
  AchievementRepository,
  type IAchievementRepository,
} from '@lily/api/repositories/achievement.repository'
import type { userAchievements } from '@lily/db/schema'
import type { AchievementKey } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe } from 'effect'

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
      Effect.succeed(
        Array.filter(unlockedAchievements, (a) => a.userId === userId)
      ),

    hasAchievement: (userId: string, key: AchievementKey) =>
      Effect.succeed(
        Array.some(
          unlockedAchievements,
          (a) => a.userId === userId && a.achievement === key
        )
      ),

    unlock: (userId: string, key: AchievementKey) => {
      const existingOption = Array.findFirst(
        unlockedAchievements,
        (a) => a.userId === userId && a.achievement === key
      )
      if (Option.isSome(existingOption)) {
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
    ) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.careLogCounts),
          Option.flatMap((counts) => Option.fromNullable(counts[type])),
          Option.getOrElse(() => 0)
        )
      ),

    countPlants: (_userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.plantCount),
          Option.getOrElse(() => 0)
        )
      ),

    countPhotos: (_userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.photoCount),
          Option.getOrElse(() => 0)
        )
      ),

    getCareStreak: (_userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.careStreak),
          Option.getOrElse(() => 0)
        )
      ),

    countScans: (_userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.scanCount),
          Option.getOrElse(() => 0)
        )
      ),

    countPhotosForPlant: (_userId: string, _plantId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.plantPhotoCount),
          Option.getOrElse(() => 0)
        )
      ),

    incrementHistoryViews: (_userId: string) => {
      const currentCount = pipe(
        Option.fromNullable(data.historyViewCount),
        Option.getOrElse(() => 0)
      )
      data.historyViewCount = currentCount + 1
      return Effect.succeed(data.historyViewCount)
    },

    getHistoryViewCount: (_userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(data.historyViewCount),
          Option.getOrElse(() => 0)
        )
      ),

    findUserIdsWithPlants: () => {
      const userIds = pipe(
        data.achievements,
        Array.map((a) => a.userId),
        Array.dedupe
      )
      return Effect.succeed(userIds)
    },
  }

  return Layer.succeed(AchievementRepository, repo)
}
