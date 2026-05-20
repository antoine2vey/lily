import { createTestUserAchievement } from '@lily/api/__tests__/fixtures/achievements'
import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { unlockAchievement } from '@lily/api/services/achievements/endpoints/unlock-achievement'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { ACHIEVEMENTS } from '@lily/shared'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const createCurrentUserLayer = (
  userId: string,
  role: 'user' | 'admin' = 'admin'
) =>
  Layer.succeed(CurrentUser, {
    id: userId,
    email: 'test@test.com',
    name: 'Test User',

    firstName: null,

    lastName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    role,
    status: 'active' as const,
  })

describe('unlockAchievement', () => {
  const userId = 'user-1'

  const createTestLayer = (
    achievements: Parameters<
      typeof createMockAchievementRepository
    >[0]['achievements'],
    uid = userId
  ) =>
    Layer.merge(
      createMockAchievementRepository({ achievements }),
      createCurrentUserLayer(uid)
    )

  it('should unlock new achievement successfully', async () => {
    const result = await Effect.runPromise(
      unlockAchievement({ achievement: 'PLANT_COLLECTOR' }).pipe(
        Effect.provide(createTestLayer([]))
      )
    )

    expect(result.key).toBe('PLANT_COLLECTOR')
    expect(result.userId).toBe(userId)
    expect(result.name).toBe(ACHIEVEMENTS.PLANT_COLLECTOR.name)
    expect(result.description).toBe(ACHIEVEMENTS.PLANT_COLLECTOR.description)
    expect(result.iconUrl).toBe(ACHIEVEMENTS.PLANT_COLLECTOR.iconUrl)
    expect(result.unlockedAt).toBeDefined()
  })

  it('should return existing achievement if already unlocked', async () => {
    const existingAchievement = createTestUserAchievement({
      userId,
      achievement: 'FIRST_PLANT_ADDED',
    })

    const result = await Effect.runPromise(
      unlockAchievement({ achievement: 'FIRST_PLANT_ADDED' }).pipe(
        Effect.provide(createTestLayer([existingAchievement]))
      )
    )

    expect(result.key).toBe('FIRST_PLANT_ADDED')
    expect(result.name).toBe(ACHIEVEMENTS.FIRST_PLANT_ADDED.name)
  })

  it('should return achievement with definition details', async () => {
    const result = await Effect.runPromise(
      unlockAchievement({ achievement: 'WATERING_NOVICE' }).pipe(
        Effect.provide(createTestLayer([]))
      )
    )

    expect(result.name).toBe('Watering Novice')
    expect(result.description).toBe('Watered your plants 10 times')
    expect(result.iconUrl).toBe('/achievements/watering-novice.png')
  })

  it('should include all required fields in response', async () => {
    const result = await Effect.runPromise(
      unlockAchievement({ achievement: 'PHOTO_PRO' }).pipe(
        Effect.provide(createTestLayer([]))
      )
    )

    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('key')
    expect(result).toHaveProperty('name')
    expect(result).toHaveProperty('description')
    expect(result).toHaveProperty('iconUrl')
    expect(result).toHaveProperty('unlockedAt')
    expect(result).toHaveProperty('userId')
  })

  it('should handle multiple users unlocking same achievement', async () => {
    const user1Achievement = createTestUserAchievement({
      userId: 'user-1',
      achievement: 'AI_CONVERSATIONALIST',
    })

    const result = await Effect.runPromise(
      unlockAchievement({ achievement: 'AI_CONVERSATIONALIST' }).pipe(
        Effect.provide(createTestLayer([user1Achievement], 'user-2'))
      )
    )

    expect(result.userId).toBe('user-2')
    expect(result.key).toBe('AI_CONVERSATIONALIST')
  })

  it('should unlock different achievements for same user', async () => {
    const existingAchievement = createTestUserAchievement({
      userId,
      achievement: 'FIRST_PLANT_ADDED',
    })

    const result = await Effect.runPromise(
      unlockAchievement({ achievement: 'DEDICATED_CARETAKER' }).pipe(
        Effect.provide(createTestLayer([existingAchievement]))
      )
    )

    expect(result.key).toBe('DEDICATED_CARETAKER')
    expect(result.name).toBe('Dedicated Caretaker')
  })

  it('should fail with ForbiddenError when non-admin tries to unlock', async () => {
    const nonAdminLayer = Layer.merge(
      createMockAchievementRepository({ achievements: [] }),
      createCurrentUserLayer(userId, 'user')
    )

    const result = await Effect.runPromiseExit(
      unlockAchievement({ achievement: 'PLANT_COLLECTOR' }).pipe(
        Effect.provide(nonAdminLayer)
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
      expect(result.cause.error).toBeInstanceOf(ForbiddenError)
    }
  })

  it('should preserve original unlock time when returning existing', async () => {
    const originalUnlockTime = new Date('2024-01-15T10:00:00Z')
    const existingAchievement = createTestUserAchievement({
      userId,
      achievement: 'SCAN_CHAMP',
      unlockedAt: originalUnlockTime,
    })

    const result = await Effect.runPromise(
      unlockAchievement({ achievement: 'SCAN_CHAMP' }).pipe(
        Effect.provide(createTestLayer([existingAchievement]))
      )
    )

    expect(result.unlockedAt).toEqual(originalUnlockTime)
  })
})
