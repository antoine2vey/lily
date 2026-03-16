import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import type { AchievementKey } from '@lily/shared'
import { ACHIEVEMENTS } from '@lily/shared'
import { Array, Effect, Match, pipe, Record } from 'effect'

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

const reconcileUserAchievements = (userId: string) =>
  Effect.gen(function* () {
    const repo = yield* AchievementRepository

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

    const missedKeys = pipe(
      allKeys,
      Array.filter((key) => {
        const alreadyUnlocked = Array.some(
          unlocked,
          (u) => u.achievement === key
        )
        if (alreadyUnlocked) return false

        const progress = getProgressForKey(counts, key)
        const threshold = ACHIEVEMENTS[key].threshold ?? null
        return progress !== null && threshold !== null && progress >= threshold
      })
    )

    yield* Effect.forEach(missedKeys, (key) => repo.unlock(userId, key), {
      concurrency: 'unbounded',
    })

    return missedKeys.length
  })

// Reconcile threshold-based achievements for all active users
export const reconcileAchievements = Effect.gen(function* () {
  const repo = yield* AchievementRepository

  yield* Effect.log('Running achievement reconciliation...')

  const userIds = yield* repo.findUserIdsWithPlants()

  const results = yield* Effect.forEach(
    userIds,
    (userId) =>
      reconcileUserAchievements(userId).pipe(
        Effect.catchTag('SqlError', (e) =>
          Effect.logWarning(
            '[achievement-scheduler] Failed to reconcile achievements',
            { userId, error: String(e) }
          ).pipe(Effect.as(0))
        )
      ),
    { concurrency: 5 }
  )

  const totalReconciled = Array.reduce(results, 0, (acc, n) => acc + n)

  if (totalReconciled > 0) {
    yield* Effect.log('Reconciled missed achievements', {
      users: userIds.length,
      achievements: totalReconciled,
    })
  } else {
    yield* Effect.log('No missed achievements found', {
      users: userIds.length,
    })
  }
}).pipe(Effect.withSpan('achievement-scheduler.reconcile'))

export const startAchievementReconciliationScheduler = createScheduler({
  name: 'achievement-reconciliation',
  interval: '12 hours',
  runOnStartup: true,
  task: reconcileAchievements,
})
