import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { getUserSettings } from '@lily/api/services/user/endpoints/get-user-settings'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getUserSettings', () => {
  it('should return user settings when user exists', async () => {
    const result = await Effect.runPromise(
      getUserSettings('user-1').pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result.name).toBe('Test User')
    expect(result.email).toBe('test@example.com')
  })

  it('should return notification preferences from database', async () => {
    const result = await Effect.runPromise(
      getUserSettings('user-2').pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result.notifications.soilAlerts).toBe(false)
    expect(result.notifications.wateringReminders).toBe(true)
    expect(result.notifications.ads).toBe(true)
  })

  it('should return bio when present', async () => {
    const result = await Effect.runPromise(
      getUserSettings('user-2').pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result.bio).toBe('Plant enthusiast')
  })

  it('should return undefined bio when not set', async () => {
    const result = await Effect.runPromise(
      getUserSettings('user-1').pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result.bio).toBeUndefined()
  })

  it('should fail with UserNotFoundError when user does not exist', async () => {
    const result = await Effect.runPromiseExit(
      getUserSettings('non-existent').pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should return image when present', async () => {
    const result = await Effect.runPromise(
      getUserSettings('user-2').pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result.image).toBe('https://example.com/avatar.png')
  })

  it('should return undefined image when not set', async () => {
    const result = await Effect.runPromise(
      getUserSettings('user-1').pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result.image).toBeUndefined()
  })
})
