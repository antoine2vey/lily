import { mockUserAchievements } from '@lily/api/__tests__/fixtures/achievements'
import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { getUserAchievements } from '@lily/api/services/achievements/endpoints/get-user-achievements'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getUserAchievements', () => {
  const createTestLayer = () =>
    createMockAchievementRepository({ achievements: mockUserAchievements })

  it('should return user achievements with metadata', async () => {
    const result = await Effect.runPromise(
      getUserAchievements('user-1').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.length).toBe(2)
    expect(result[0]?.key).toBe('FIRST_PLANT_ADDED')
    expect(result[1]?.key).toBe('WATERING_NOVICE')
  })

  it('should include achievement name and description', async () => {
    const result = await Effect.runPromise(
      getUserAchievements('user-1').pipe(Effect.provide(createTestLayer()))
    )

    expect(result[0]?.name).toBeDefined()
    expect(result[0]?.description).toBeDefined()
    expect(result[0]?.iconUrl).toBeDefined()
  })

  it('should include unlockedAt timestamp', async () => {
    const result = await Effect.runPromise(
      getUserAchievements('user-1').pipe(Effect.provide(createTestLayer()))
    )

    expect(result[0]?.unlockedAt).toBeInstanceOf(Date)
  })

  it('should return empty array for user with no achievements', async () => {
    const result = await Effect.runPromise(
      getUserAchievements('user-with-no-achievements').pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result).toEqual([])
  })

  it('should only return achievements for the specified user', async () => {
    const result = await Effect.runPromise(
      getUserAchievements('user-2').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.length).toBe(1)
    expect(result[0]?.key).toBe('AI_CONVERSATIONALIST')
  })

  it('should include userId in each achievement', async () => {
    const result = await Effect.runPromise(
      getUserAchievements('user-1').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.every((a) => a.userId === 'user-1')).toBe(true)
  })
})
