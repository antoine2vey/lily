import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { getUserSettings } from '@lily/api/services/user/endpoints/get-user-settings'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getUserSettings', () => {
  const createTestLayer = (userId: string) =>
    Layer.mergeAll(
      createMockUserRepository([...mockUsers]),
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

    expect(result.notifications.soilAlerts).toBe(false)
    expect(result.notifications.wateringReminders).toBe(true)
    expect(result.notifications.ads).toBe(true)
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
      getUserSettings().pipe(
        Effect.provide(createTestLayer('non-existent'))
      )
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
})
