import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import { reconcileAchievements } from '@lily/api/services/achievement-scheduler/scheduler'
import type { AchievementKey } from '@lily/shared'
import { Array, Effect } from 'effect'

const makeAchievement = (
  userId: string,
  achievement: AchievementKey,
  id = `ach-${crypto.randomUUID()}`
) => ({
  id,
  userId,
  achievement,
  unlockedAt: new Date(),
})

describe('reconcileAchievements', () => {
  it('should unlock a missed threshold-based achievement', async () => {
    const mockRepo = createMockAchievementRepository({
      achievements: [makeAchievement('user-1', 'FIRST_PLANT_ADDED')],
      plantCount: 5,
    })

    await Effect.runPromise(
      reconcileAchievements.pipe(Effect.provide(mockRepo))
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AchievementRepository
        return yield* repo.findByUserId('user-1')
      }).pipe(Effect.provide(mockRepo))
    )

    expect(Array.some(result, (a) => a.achievement === 'PLANT_COLLECTOR')).toBe(
      true
    )
  })

  it('should skip already-unlocked achievements', async () => {
    const mockRepo = createMockAchievementRepository({
      achievements: [
        makeAchievement('user-1', 'FIRST_PLANT_ADDED'),
        makeAchievement('user-1', 'PLANT_COLLECTOR'),
      ],
      plantCount: 5,
    })

    await Effect.runPromise(
      reconcileAchievements.pipe(Effect.provide(mockRepo))
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AchievementRepository
        return yield* repo.findByUserId('user-1')
      }).pipe(Effect.provide(mockRepo))
    )

    const collectorCount = Array.filter(
      result,
      (a) => a.achievement === 'PLANT_COLLECTOR'
    ).length
    expect(collectorCount).toBe(1)
  })

  it('should not unlock event-based achievements', async () => {
    const mockRepo = createMockAchievementRepository({
      achievements: [makeAchievement('user-1', 'FIRST_PLANT_ADDED')],
      plantCount: 100,
      careLogCounts: { watering: 100, fertilization: 100 },
      careStreak: 100,
      photoCount: 100,
      scanCount: 100,
      historyViewCount: 100,
    })

    await Effect.runPromise(
      reconcileAchievements.pipe(Effect.provide(mockRepo))
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AchievementRepository
        return yield* repo.findByUserId('user-1')
      }).pipe(Effect.provide(mockRepo))
    )

    const eventBased: ReadonlyArray<AchievementKey> = [
      'ATTENTION_ALERT',
      'RARE_COLLECTOR',
      'AI_CONVERSATIONALIST',
      'DISEASE_DETECTIVE',
      'GROWTH_TRACKER',
      'REMINDER_RESCUER',
      'SHARE_SPROUT',
    ]

    for (const key of eventBased) {
      expect(Array.some(result, (a) => a.achievement === key)).toBe(false)
    }
  })

  it('should unlock multiple achievements at once', async () => {
    const mockRepo = createMockAchievementRepository({
      achievements: [makeAchievement('user-1', 'FIRST_PLANT_ADDED')],
      plantCount: 5,
      careLogCounts: { watering: 10, fertilization: 10 },
      careStreak: 3,
      photoCount: 10,
      scanCount: 5,
    })

    await Effect.runPromise(
      reconcileAchievements.pipe(Effect.provide(mockRepo))
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AchievementRepository
        return yield* repo.findByUserId('user-1')
      }).pipe(Effect.provide(mockRepo))
    )

    const expectedKeys: ReadonlyArray<AchievementKey> = [
      'PLANT_COLLECTOR',
      'WATERING_NOVICE',
      'FERTILIZER_GURU',
      'DEDICATED_CARETAKER',
      'PHOTO_PRO',
      'SCAN_CHAMP',
    ]

    for (const key of expectedKeys) {
      expect(Array.some(result, (a) => a.achievement === key)).toBe(true)
    }
  })

  it('should exit cleanly when no users have plants', async () => {
    const mockRepo = createMockAchievementRepository({
      achievements: [],
    })

    await Effect.runPromise(
      reconcileAchievements.pipe(Effect.provide(mockRepo))
    )
  })

  it('should not unlock when counts are below threshold', async () => {
    const mockRepo = createMockAchievementRepository({
      achievements: [makeAchievement('user-1', 'FIRST_PLANT_ADDED')],
      plantCount: 3,
      careLogCounts: { watering: 5, fertilization: 2 },
      careStreak: 1,
      photoCount: 4,
      scanCount: 2,
    })

    await Effect.runPromise(
      reconcileAchievements.pipe(Effect.provide(mockRepo))
    )

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AchievementRepository
        return yield* repo.findByUserId('user-1')
      }).pipe(Effect.provide(mockRepo))
    )

    const thresholdBased: ReadonlyArray<AchievementKey> = [
      'PLANT_COLLECTOR',
      'WATERING_NOVICE',
      'FERTILIZER_GURU',
      'DEDICATED_CARETAKER',
      'PHOTO_PRO',
      'SCAN_CHAMP',
    ]

    for (const key of thresholdBased) {
      expect(Array.some(result, (a) => a.achievement === key)).toBe(false)
    }
  })

  it('should reconcile multiple users independently', async () => {
    const mockRepo = createMockAchievementRepository({
      achievements: [
        makeAchievement('user-1', 'FIRST_PLANT_ADDED'),
        makeAchievement('user-2', 'FIRST_PLANT_ADDED'),
        makeAchievement('user-2', 'PLANT_COLLECTOR'),
      ],
      plantCount: 5,
    })

    await Effect.runPromise(
      reconcileAchievements.pipe(Effect.provide(mockRepo))
    )

    const [result1, result2] = await Effect.runPromise(
      Effect.all([
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-1')
        }),
        Effect.gen(function* () {
          const repo = yield* AchievementRepository
          return yield* repo.findByUserId('user-2')
        }),
      ]).pipe(Effect.provide(mockRepo))
    )

    // user-1 should have PLANT_COLLECTOR unlocked by reconciliation
    expect(
      Array.some(result1, (a) => a.achievement === 'PLANT_COLLECTOR')
    ).toBe(true)

    // user-2 already had PLANT_COLLECTOR, should still have exactly one
    const user2CollectorCount = Array.filter(
      result2,
      (a) => a.achievement === 'PLANT_COLLECTOR'
    ).length
    expect(user2CollectorCount).toBe(1)
  })
})
