import { mockUserAchievements } from '@lily/api/__tests__/fixtures/achievements'
import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { getUserAchievements } from '@lily/api/services/achievements/endpoints/get-user-achievements'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const createCurrentUserLayer = (userId: string) =>
  Layer.succeed(CurrentUser, {
    id: userId,
    email: 'test@test.com',
    name: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date(),
    role: 'user' as const,
    status: 'active' as const,
  })

describe('getUserAchievements', () => {
  const createTestLayer = (userId: string) =>
    Layer.merge(
      createMockAchievementRepository({
        achievements: mockUserAchievements,
        plantCount: 3,
        careLogCounts: { watering: 5, fertilization: 2 },
        photoCount: 1,
        careStreak: 1,
        scanCount: 0,
      }),
      createCurrentUserLayer(userId)
    )

  it('should return all 15 achievements with progress', async () => {
    const result = await Effect.runPromise(
      getUserAchievements().pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(result.achievements.length).toBe(15)
    expect(result.totalCount).toBe(15)
  })

  it('should mark unlocked achievements correctly', async () => {
    const result = await Effect.runPromise(
      getUserAchievements().pipe(Effect.provide(createTestLayer('user-1')))
    )

    const firstPlant = Array.findFirst(
      result.achievements,
      (a) => a.key === 'FIRST_PLANT_ADDED'
    )
    expect(firstPlant._tag).toBe('Some')
    if (firstPlant._tag === 'Some') {
      expect(firstPlant.value.unlocked).toBe(true)
      expect(firstPlant.value.unlockedAt).toBeInstanceOf(Date)
    }
  })

  it('should include category and rarity', async () => {
    const result = await Effect.runPromise(
      getUserAchievements().pipe(Effect.provide(createTestLayer('user-1')))
    )

    const firstPlant = Array.findFirst(
      result.achievements,
      (a) => a.key === 'FIRST_PLANT_ADDED'
    )
    if (firstPlant._tag === 'Some') {
      expect(firstPlant.value.category).toBe('plants')
      expect(firstPlant.value.rarity).toBe('common')
      expect(firstPlant.value.icon).toBe('eco')
    }
  })

  it('should include progress for threshold-based achievements', async () => {
    const result = await Effect.runPromise(
      getUserAchievements().pipe(Effect.provide(createTestLayer('user-1')))
    )

    const collector = Array.findFirst(
      result.achievements,
      (a) => a.key === 'PLANT_COLLECTOR'
    )
    if (collector._tag === 'Some') {
      expect(collector.value.progress).toBe(3)
      expect(collector.value.maxProgress).toBe(5)
    }
  })

  it('should compute level from unlocked count', async () => {
    const result = await Effect.runPromise(
      getUserAchievements().pipe(Effect.provide(createTestLayer('user-1')))
    )

    // user-1 has 2 unlocked achievements: FIRST_PLANT_ADDED + WATERING_NOVICE
    expect(result.unlockedCount).toBe(2)
    expect(result.level).toBe(Math.floor(2 / 3) + 1)
  })

  it('should return 0 unlocked for user with no achievements', async () => {
    const result = await Effect.runPromise(
      getUserAchievements().pipe(
        Effect.provide(createTestLayer('user-with-no-achievements'))
      )
    )

    expect(result.unlockedCount).toBe(0)
    expect(result.level).toBe(1)
    expect(Array.every(result.achievements, (a) => a.unlocked === false)).toBe(
      true
    )
  })
})
