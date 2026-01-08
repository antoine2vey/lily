import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('updateUserSettings', () => {
  it('should update user name', async () => {
    const result = await Effect.runPromise(
      updateUserSettings('user-1', { name: 'Updated Name' }).pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result.name).toBe('Updated Name')
  })

  it('should update user bio', async () => {
    const result = await Effect.runPromise(
      updateUserSettings('user-1', { bio: 'New bio text' }).pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result.bio).toBe('New bio text')
  })

  it('should update notification preferences', async () => {
    const result = await Effect.runPromise(
      updateUserSettings('user-1', {
        notifications: {
          soilAlerts: false,
          wateringReminders: false,
          ads: true,
        },
      }).pipe(Effect.provide(createMockUserRepository([...mockUsers])))
    )

    expect(result.notifications.soilAlerts).toBe(false)
    expect(result.notifications.wateringReminders).toBe(false)
    expect(result.notifications.ads).toBe(true)
  })

  it('should update partial notification preferences', async () => {
    const result = await Effect.runPromise(
      updateUserSettings('user-1', {
        notifications: {
          soilAlerts: false,
        },
      }).pipe(Effect.provide(createMockUserRepository([...mockUsers])))
    )

    expect(result.notifications.soilAlerts).toBe(false)
    // Other notification settings should remain unchanged
    expect(result.notifications.wateringReminders).toBe(true)
    expect(result.notifications.ads).toBe(false)
  })

  it('should update multiple fields at once', async () => {
    const result = await Effect.runPromise(
      updateUserSettings('user-1', {
        name: 'New Name',
        bio: 'New bio',
        image: 'https://new-image.com/avatar.png',
        notifications: {
          ads: true,
        },
      }).pipe(Effect.provide(createMockUserRepository([...mockUsers])))
    )

    expect(result.name).toBe('New Name')
    expect(result.bio).toBe('New bio')
    expect(result.image).toBe('https://new-image.com/avatar.png')
    expect(result.notifications.ads).toBe(true)
  })

  it('should fail with UserNotFoundError when user does not exist', async () => {
    const result = await Effect.runPromiseExit(
      updateUserSettings('non-existent', { name: 'Test' }).pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should preserve unchanged fields', async () => {
    const result = await Effect.runPromise(
      updateUserSettings('user-2', { name: 'Changed Name' }).pipe(
        Effect.provide(createMockUserRepository([...mockUsers]))
      )
    )

    expect(result.name).toBe('Changed Name')
    expect(result.email).toBe('another@example.com')
    expect(result.bio).toBe('Plant enthusiast')
    expect(result.notifications.soilAlerts).toBe(false)
  })
})
