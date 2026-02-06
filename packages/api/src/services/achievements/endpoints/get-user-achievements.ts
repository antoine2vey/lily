import type { SqlError } from '@effect/sql/SqlError'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type {
  AchievementKey,
  AchievementsResponse,
  AchievementWithProgress,
} from '@lily/shared'
import { ACHIEVEMENTS } from '@lily/shared'
import { Array, Effect, Match, Option, pipe, Record } from 'effect'

interface ProgressCounts {
  plants: number
  watering: number
  fertilization: number
  careStreak: number
  photos: number
  scans: number
  historyViews: number
}

const getProgressForKey = (
  counts: ProgressCounts,
  key: AchievementKey
): number | null =>
  pipe(
    Match.value(key),
    Match.when('PLANT_COLLECTOR', () => counts.plants),
    Match.when('WATERING_NOVICE', () => counts.watering),
    Match.when('FERTILIZER_GURU', () => counts.fertilization),
    Match.when('DEDICATED_CARETAKER', () => counts.careStreak),
    Match.when('PHOTO_PRO', () => counts.photos),
    Match.when('SCAN_CHAMP', () => counts.scans),
    Match.when('HISTORY_HERO', () => counts.historyViews),
    Match.when('FIRST_PLANT_ADDED', () => null),
    Match.when('ATTENTION_ALERT', () => null),
    Match.when('RARE_COLLECTOR', () => null),
    Match.when('AI_CONVERSATIONALIST', () => null),
    Match.when('DISEASE_DETECTIVE', () => null),
    Match.when('GROWTH_TRACKER', () => null),
    Match.when('REMINDER_RESCUER', () => null),
    Match.when('SHARE_SPROUT', () => null),
    Match.exhaustive
  )

// Get all achievements with progress for the current user
export const getUserAchievements = (): Effect.Effect<
  AchievementsResponse,
  SqlError,
  AchievementRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const { id: userId } = yield* CurrentUser
    const repo = yield* AchievementRepository

    // Fetch all data in parallel: unlocked achievements + all progress counts
    const [unlocked, counts] = yield* Effect.all([
      repo.findByUserId(userId),
      Effect.all({
        plants: repo.countPlants(userId),
        watering: repo.countCareLogsByType(userId, 'watering'),
        fertilization: repo.countCareLogsByType(userId, 'fertilization'),
        careStreak: repo.getCareStreak(userId),
        photos: repo.countPhotos(userId),
        scans: repo.countScans(userId),
        historyViews: repo.getHistoryViewCount(userId),
      }),
    ])

    const allKeys = Record.keys(ACHIEVEMENTS) as unknown as AchievementKey[]

    const achievements: AchievementWithProgress[] = Array.map(
      allKeys,
      (key) => {
        const def = ACHIEVEMENTS[key]
        const unlockedEntry = Array.findFirst(
          unlocked,
          (u) => u.achievement === key
        )

        return {
          key,
          name: def.name,
          description: def.description,
          icon: def.icon,
          category: def.category,
          rarity: def.rarity,
          unlocked: Option.isSome(unlockedEntry),
          unlockedAt: pipe(
            unlockedEntry,
            Option.map((u) => u.unlockedAt),
            Option.getOrNull
          ),
          progress: getProgressForKey(counts, key),
          maxProgress: pipe(
            Option.fromNullable(def.threshold),
            Option.getOrNull
          ),
        } satisfies AchievementWithProgress
      }
    )

    const unlockedCount = Array.filter(achievements, (a) => a.unlocked).length

    return {
      achievements,
      level: Math.floor(unlockedCount / 3) + 1,
      unlockedCount,
      totalCount: achievements.length,
    }
  }).pipe(Effect.withSpan('AchievementsService.getUserAchievements'))
