import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import type { Notification } from '@lily/shared/notification'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Future date to avoid "past date + 1 day" adjustment in calculateScheduledAt
const futureDate = new Date('2030-06-15T00:00:00.000Z')

const testPlant = createTestPlant({
  id: 'plant-recalc',
  name: 'Test Plant',
  userId: 'user-1',
  scheduleSpecs: [wateringSpec({ nextCareAt: futureDate })],
})

const testUser = {
  ...mockUser1,
  timezone: 'UTC',
  preferredNotificationTime: '09:00',
}

describe('updateUserSettings - notification recalculation', () => {
  it('should recalculate pending notifications when preferredNotificationTime changes', async () => {
    const originalScheduledAt = new Date('2030-06-15T09:00:00.000Z')
    const pendingNotification: Notification = {
      id: 'notif-1',
      type: 'watering_reminder',
      title: 'Water your plant',
      body: 'Time to water',
      scheduledAt: originalScheduledAt,
      isRead: false,
      status: 'pending',
      retryCount: 0,
      userId: 'user-1',
      plantId: 'plant-recalc',
      createdAt: new Date(),
    }

    // Track calls to updateScheduledAt
    let capturedScheduledAt: Date | null = null
    const notificationMockLayer = createMockNotificationRepository([
      pendingNotification,
    ])

    // Wrap the mock to capture updateScheduledAt calls
    const trackingLayer = Layer.effect(
      NotificationRepository,
      Effect.gen(function* () {
        const repo = yield* Effect.provide(
          NotificationRepository,
          notificationMockLayer
        )
        return {
          ...repo,
          updateScheduledAt: (id: string, scheduledAt: Date) => {
            capturedScheduledAt = scheduledAt
            return repo.updateScheduledAt(id, scheduledAt)
          },
        }
      })
    )

    const layer = Layer.mergeAll(
      createMockUserRepository([testUser]),
      createMockCurrentUser({ id: 'user-1' }),
      trackingLayer,
      createMockPlantRepository({ plants: [testPlant] }),
      createMockCareLogRepository([]),
      createMockCareScheduleRepository({
        schedules: schedulesFromPlants([testPlant]),
        plants: [testPlant],
      })
    )

    await Effect.runPromise(
      updateUserSettings({ preferredNotificationTime: '14:00' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(capturedScheduledAt).not.toBeNull()
    // The new time should reflect 14:00 UTC (since user timezone is UTC)
    expect(capturedScheduledAt!.getUTCHours()).toBe(14)
    expect(capturedScheduledAt!.getUTCMinutes()).toBe(0)
  })

  it('should recalculate pending notifications when timezone changes', async () => {
    const pendingNotification: Notification = {
      id: 'notif-2',
      type: 'watering_reminder',
      title: 'Water your plant',
      body: 'Time to water',
      scheduledAt: new Date('2030-06-15T09:00:00.000Z'),
      isRead: false,
      status: 'pending',
      retryCount: 0,
      userId: 'user-1',
      plantId: 'plant-recalc',
      createdAt: new Date(),
    }

    let capturedScheduledAt: Date | null = null
    const notificationMockLayer = createMockNotificationRepository([
      pendingNotification,
    ])

    const trackingLayer = Layer.effect(
      NotificationRepository,
      Effect.gen(function* () {
        const repo = yield* Effect.provide(
          NotificationRepository,
          notificationMockLayer
        )
        return {
          ...repo,
          updateScheduledAt: (id: string, scheduledAt: Date) => {
            capturedScheduledAt = scheduledAt
            return repo.updateScheduledAt(id, scheduledAt)
          },
        }
      })
    )

    const layer = Layer.mergeAll(
      createMockUserRepository([testUser]),
      createMockCurrentUser({ id: 'user-1' }),
      trackingLayer,
      createMockPlantRepository({ plants: [testPlant] }),
      createMockCareLogRepository([]),
      createMockCareScheduleRepository({
        schedules: schedulesFromPlants([testPlant]),
        plants: [testPlant],
      })
    )

    // Change timezone from UTC to America/New_York (EDT = UTC-4 in June)
    await Effect.runPromise(
      updateUserSettings({ timezone: 'America/New_York' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(capturedScheduledAt).not.toBeNull()
    // 09:00 in America/New_York during summer (EDT = UTC-4) = 13:00 UTC
    expect(capturedScheduledAt!.getUTCHours()).toBe(13)
  })

  it('should NOT recalculate when preferredNotificationTime stays the same', async () => {
    const pendingNotification: Notification = {
      id: 'notif-3',
      type: 'watering_reminder',
      title: 'Water your plant',
      body: 'Time to water',
      scheduledAt: new Date('2030-06-15T09:00:00.000Z'),
      isRead: false,
      status: 'pending',
      retryCount: 0,
      userId: 'user-1',
      plantId: 'plant-recalc',
      createdAt: new Date(),
    }

    let updateScheduledAtCalled = false
    const notificationMockLayer = createMockNotificationRepository([
      pendingNotification,
    ])

    const trackingLayer = Layer.effect(
      NotificationRepository,
      Effect.gen(function* () {
        const repo = yield* Effect.provide(
          NotificationRepository,
          notificationMockLayer
        )
        return {
          ...repo,
          updateScheduledAt: (id: string, scheduledAt: Date) => {
            updateScheduledAtCalled = true
            return repo.updateScheduledAt(id, scheduledAt)
          },
        }
      })
    )

    const layer = Layer.mergeAll(
      createMockUserRepository([testUser]),
      createMockCurrentUser({ id: 'user-1' }),
      trackingLayer,
      createMockPlantRepository({ plants: [testPlant] }),
      createMockCareLogRepository([]),
      createMockCareScheduleRepository({
        schedules: schedulesFromPlants([testPlant]),
        plants: [testPlant],
      })
    )

    // Send the same preferredNotificationTime as existing (09:00)
    await Effect.runPromise(
      updateUserSettings({ preferredNotificationTime: '09:00' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(updateScheduledAtCalled).toBe(false)
  })

  it('should NOT recalculate when updating unrelated settings', async () => {
    const pendingNotification: Notification = {
      id: 'notif-4',
      type: 'watering_reminder',
      title: 'Water your plant',
      body: 'Time to water',
      scheduledAt: new Date('2030-06-15T09:00:00.000Z'),
      isRead: false,
      status: 'pending',
      retryCount: 0,
      userId: 'user-1',
      plantId: 'plant-recalc',
      createdAt: new Date(),
    }

    let updateScheduledAtCalled = false
    const notificationMockLayer = createMockNotificationRepository([
      pendingNotification,
    ])

    const trackingLayer = Layer.effect(
      NotificationRepository,
      Effect.gen(function* () {
        const repo = yield* Effect.provide(
          NotificationRepository,
          notificationMockLayer
        )
        return {
          ...repo,
          updateScheduledAt: (id: string, scheduledAt: Date) => {
            updateScheduledAtCalled = true
            return repo.updateScheduledAt(id, scheduledAt)
          },
        }
      })
    )

    const layer = Layer.mergeAll(
      createMockUserRepository([testUser]),
      createMockCurrentUser({ id: 'user-1' }),
      trackingLayer,
      createMockPlantRepository({ plants: [testPlant] }),
      createMockCareLogRepository([]),
      createMockCareScheduleRepository({
        schedules: schedulesFromPlants([testPlant]),
        plants: [testPlant],
      })
    )

    // Update name only - should NOT trigger recalculation
    await Effect.runPromise(
      updateUserSettings({ name: 'New Name' }).pipe(Effect.provide(layer))
    )

    expect(updateScheduledAtCalled).toBe(false)
  })
})
