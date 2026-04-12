import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import type {
  PlantWithoutRecentPhoto,
  UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import { processPhotoReminders } from '@lily/api/services/engagement-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

const makeUser = (
  overrides: Partial<UserWithSettings> & { id: string }
): UserWithSettings => ({
  tips: true,
  personalizedTips: false,
  timezone: 'Europe/Paris',
  doNotDisturb: false,
  doNotDisturbStart: null,
  doNotDisturbEnd: null,
  language: 'en',
  createdAt: daysAgo(60),
  ...overrides,
})

const makeStalePlant = (
  overrides: Partial<PlantWithoutRecentPhoto> & {
    plantId: string
  }
): PlantWithoutRecentPhoto => ({
  plantName: `Plant ${overrides.plantId}`,
  userId: 'user-1',
  lastPhotoAt: null,
  dateAdded: daysAgo(60),
  ...overrides,
})

describe('processPhotoReminders', () => {
  it('creates notification for plant without recent photo', async () => {
    const user = makeUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithoutRecentPhoto: {
          'user-1': [
            makeStalePlant({
              plantId: 'plant-1',
              userId: 'user-1',
              lastPhotoAt: daysAgo(45),
            }),
          ],
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('photo_reminder')
    expect(notifications[0]?.userId).toBe('user-1')
    expect(notifications[0]?.plantId).toBe('plant-1')
  })

  it('skips user with no stale plants', async () => {
    const user = makeUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithoutRecentPhoto: { 'user-1': [] },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('dedup: skips plant already notified in last 30 days', async () => {
    const user = makeUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithoutRecentPhoto: {
          'user-1': [
            makeStalePlant({
              plantId: 'plant-1',
              userId: 'user-1',
            }),
          ],
        },
        notificationsForPlantInPeriod: {
          'user-1:photo_reminder:plant-1': true,
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('creates one notification per stale plant', async () => {
    const user = makeUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithoutRecentPhoto: {
          'user-1': [
            makeStalePlant({
              plantId: 'plant-1',
              userId: 'user-1',
            }),
            makeStalePlant({
              plantId: 'plant-2',
              userId: 'user-1',
            }),
            makeStalePlant({
              plantId: 'plant-3',
              userId: 'user-1',
            }),
          ],
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(3)
    expect(notifications[0]?.plantId).toBe('plant-1')
    expect(notifications[1]?.plantId).toBe('plant-2')
    expect(notifications[2]?.plantId).toBe('plant-3')
  })

  it('handles empty user list without errors', async () => {
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPhotoReminders([]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('mixed: some plants already notified, some not', async () => {
    const user = makeUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithoutRecentPhoto: {
          'user-1': [
            makeStalePlant({
              plantId: 'plant-1',
              userId: 'user-1',
            }),
            makeStalePlant({
              plantId: 'plant-2',
              userId: 'user-1',
            }),
          ],
        },
        notificationsForPlantInPeriod: {
          'user-1:photo_reminder:plant-1': true,
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.plantId).toBe('plant-2')
  })

  it('skips user within DND window gracefully', async () => {
    const user = makeUser({
      id: 'user-1',
      doNotDisturb: true,
      doNotDisturbStart: '00:00',
      doNotDisturbEnd: '23:59',
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithoutRecentPhoto: {
          'user-1': [
            makeStalePlant({
              plantId: 'plant-1',
              userId: 'user-1',
            }),
          ],
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })
})
