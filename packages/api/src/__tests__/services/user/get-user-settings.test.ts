import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { getUserSettings } from '@lily/api/services/user/endpoints/get-user-settings'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getUserSettings', () => {
  const createTestLayer = (
    userId: string,
    careLogsCount?: Record<string, number>
  ) =>
    Layer.mergeAll(
      createMockUserRepository([...mockUsers]),
      createMockCareLogRepository(
        [],
        careLogsCount ? { countByUser: careLogsCount } : undefined
      ),
      createMockCurrentUser({ id: userId })
    )

  it('should return user settings when user exists', async () => {
    const result = await Effect.runPromise(
      getUserSettings().pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(result.name).toBe('Test User')
    expect(result.email).toBe('test@example.com')
  })

  it('should return notification preferences from database', async () => {
    const result = await Effect.runPromise(
      getUserSettings().pipe(Effect.provide(createTestLayer('user-2')))
    )

    expect(result.notifications.careReminders).toBe(false)
    expect(result.notifications.weeklyDigest).toBe(true)
    expect(result.notifications.achievements).toBe(true)
    expect(result.notifications.tips).toBe(true)
    expect(result.notifications.productUpdates).toBe(false)
    expect(result.notifications.ads).toBe(true)
    expect(result.notifications.doNotDisturb).toBe(false)
    expect(result.notifications.doNotDisturbStart).toBe('22:00')
    expect(result.notifications.doNotDisturbEnd).toBe('07:00')
  })

  it('should return bio when present', async () => {
    const result = await Effect.runPromise(
      getUserSettings().pipe(Effect.provide(createTestLayer('user-2')))
    )

    expect(result.bio).toBe('Plant enthusiast')
  })

  it('should return undefined bio when not set', async () => {
    const result = await Effect.runPromise(
      getUserSettings().pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(result.bio).toBeUndefined()
  })

  it('should fail with UserNotFoundError when user does not exist', async () => {
    const result = await Effect.runPromiseExit(
      getUserSettings().pipe(Effect.provide(createTestLayer('non-existent')))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should return image when present', async () => {
    const result = await Effect.runPromise(
      getUserSettings().pipe(Effect.provide(createTestLayer('user-2')))
    )

    expect(result.image).toBe('https://example.com/avatar.png')
  })

  it('should return undefined image when not set', async () => {
    const result = await Effect.runPromise(
      getUserSettings().pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(result.image).toBeUndefined()
  })

  it('should return privacy preferences from database', async () => {
    const result = await Effect.runPromise(
      getUserSettings().pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(result.privacy.publicProfile).toBe(true)
    expect(result.privacy.shareGrowthData).toBe(true)
    expect(result.privacy.personalizedTips).toBe(true)
  })

  it('should return privacy preferences for user with custom values', async () => {
    const result = await Effect.runPromise(
      getUserSettings().pipe(Effect.provide(createTestLayer('user-2')))
    )

    expect(result.privacy.publicProfile).toBe(false)
    expect(result.privacy.shareGrowthData).toBe(true)
    expect(result.privacy.personalizedTips).toBe(false)
  })

  it('should return the all-time care logs count for the user', async () => {
    const result = await Effect.runPromise(
      getUserSettings().pipe(
        Effect.provide(createTestLayer('user-1', { 'user-1': 156 }))
      )
    )

    expect(result.careLogsCount).toBe(156)
  })

  it('should default care logs count to 0 when the user has none', async () => {
    const result = await Effect.runPromise(
      getUserSettings().pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(result.careLogsCount).toBe(0)
  })
})
