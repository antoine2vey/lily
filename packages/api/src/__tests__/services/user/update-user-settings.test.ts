import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import type { Notification } from '@lily/shared/notification'
import { Array as Arr, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('updateUserSettings', () => {
  const createTestLayer = (userId: string) =>
    Layer.mergeAll(
      createMockRateLimiterService(),
      createMockUserRepository([...mockUsers]),
      createMockCurrentUser({ id: userId }),
      createMockNotificationRepository([]),
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository([]),
      createMockCareScheduleRepository({
        schedules: schedulesFromPlants(mockPlants),
        plants: mockPlants,
      })
    )

  it('should update user name', async () => {
    const result = await Effect.runPromise(
      updateUserSettings({ name: 'updated_name' }).pipe(
        Effect.provide(createTestLayer('user-1'))
      )
    )

    expect(result.name).toBe('updated_name')
  })

  it('should update user bio', async () => {
    const result = await Effect.runPromise(
      updateUserSettings({ bio: 'New bio text' }).pipe(
        Effect.provide(createTestLayer('user-1'))
      )
    )

    expect(result.bio).toBe('New bio text')
  })

  it('should update notification preferences', async () => {
    const result = await Effect.runPromise(
      updateUserSettings({
        notifications: {
          careReminders: false,
          weeklyDigest: false,
          ads: true,
        },
      }).pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(result.notifications.careReminders).toBe(false)
    expect(result.notifications.weeklyDigest).toBe(false)
    expect(result.notifications.ads).toBe(true)
  })

  it('should update partial notification preferences', async () => {
    const result = await Effect.runPromise(
      updateUserSettings({
        notifications: {
          careReminders: false,
        },
      }).pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(result.notifications.careReminders).toBe(false)
    // Other notification settings should remain unchanged
    expect(result.notifications.weeklyDigest).toBe(true)
    expect(result.notifications.ads).toBe(false)
  })

  it('should update multiple fields at once', async () => {
    const result = await Effect.runPromise(
      updateUserSettings({
        name: 'new_name',
        bio: 'New bio',
        image: 'https://new-image.com/avatar.png',
        notifications: {
          ads: true,
        },
      }).pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(result.name).toBe('new_name')
    expect(result.bio).toBe('New bio')
    expect(result.image).toBe('https://new-image.com/avatar.png')
    expect(result.notifications.ads).toBe(true)
  })

  it('should fail with UserNotFoundError when user does not exist', async () => {
    const result = await Effect.runPromiseExit(
      updateUserSettings({ name: 'Test' }).pipe(
        Effect.provide(createTestLayer('non-existent'))
      )
    )

    expect(result._tag).toBe('Failure')
  })

  it('should update privacy preferences', async () => {
    const result = await Effect.runPromise(
      updateUserSettings({
        privacy: {
          publicProfile: false,
          shareGrowthData: false,
        },
      }).pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(result.privacy.publicProfile).toBe(false)
    expect(result.privacy.shareGrowthData).toBe(false)
    // Unchanged field should remain
    expect(result.privacy.personalizedTips).toBe(true)
  })

  it('deletes pending rows of a preference the user turns off', async () => {
    const due = (overrides: Partial<Notification>) =>
      createTestNotification({
        userId: 'user-1',
        status: 'pending',
        ...overrides,
      })
    const notifications = [
      due({ id: 'care', type: 'watering_reminder' }),
      due({ id: 'tip', type: 'daily_tip' }),
      due({ id: 'social', type: 'new_follower' }),
      due({ id: 'in-flight', type: 'watering_reminder', status: 'queued' }),
    ]
    const layer = Layer.mergeAll(
      createMockRateLimiterService(),
      createMockUserRepository([...mockUsers]),
      createMockCurrentUser({ id: 'user-1' }),
      createMockNotificationRepository(notifications),
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository([]),
      createMockCareScheduleRepository({
        schedules: schedulesFromPlants(mockPlants),
        plants: mockPlants,
      })
    )

    await Effect.runPromise(
      updateUserSettings({
        notifications: { careReminders: false, tips: false },
      }).pipe(Effect.provide(layer))
    )

    expect(Arr.map(notifications, (n) => n.id)).toEqual(['social', 'in-flight'])
  })

  it('should preserve unchanged fields', async () => {
    const result = await Effect.runPromise(
      updateUserSettings({ name: 'changed_name' }).pipe(
        Effect.provide(createTestLayer('user-2'))
      )
    )

    expect(result.name).toBe('changed_name')
    expect(result.email).toBe('another@example.com')
    expect(result.bio).toBe('Plant enthusiast')
    expect(result.notifications.careReminders).toBe(false)
  })
})
