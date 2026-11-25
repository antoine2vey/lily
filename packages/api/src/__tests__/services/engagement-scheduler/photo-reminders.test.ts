import {
  freezeClock,
  SUNDAY_10_IN_PARIS,
} from '@lily/api/__tests__/fixtures/clock'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { notificationMocks } from '@lily/api/__tests__/mocks/notification-table'
import type {
  PlantWithoutRecentPhoto,
  UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import { photoReminder } from '@lily/api/services/engagement-scheduler/scheduler'
import { runRules } from '@lily/api/services/helpers/engagement-rules'
import { ZoneName } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// The runner records a slot only while a window of the local day is left.
freezeClock(SUNDAY_10_IN_PARIS)

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

const makeUser = (
  overrides: Partial<UserWithSettings> & { id: string }
): UserWithSettings => ({
  tips: true,
  personalizedTips: false,
  timezone: ZoneName.make('Europe/Paris'),
  doNotDisturb: false,
  doNotDisturbStart: null,
  doNotDisturbEnd: null,
  language: 'en',
  createdAt: daysAgo(60),
  vacationStatus: 'none',
  vacationStart: null,
  vacationEnd: null,
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

const processPhotoReminders = (users: ReadonlyArray<UserWithSettings>) =>
  runRules('engagement-scheduler', users, [photoReminder])

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
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('photo_reminder')
    expect(notifications[0]?.status).toBe('pending')
    expect(notifications[0]?.metadata).toEqual({})
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
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('dedup: skips plant already notified in last 30 days', async () => {
    const user = makeUser({ id: 'user-1' })
    const sent = createTestNotification({
      userId: 'user-1',
      type: 'photo_reminder',
      plantId: 'plant-1',
    })
    const notifications: Notification[] = [sent]

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
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toEqual([sent])
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
      notificationMocks(notifications).repository
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
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPhotoReminders([]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('mixed: some plants already notified, some not', async () => {
    const user = makeUser({ id: 'user-1' })
    const sent = createTestNotification({
      userId: 'user-1',
      type: 'photo_reminder',
      plantId: 'plant-1',
    })
    const notifications: Notification[] = [sent]

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
      }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications.map((n) => n.plantId)).toEqual(['plant-1', 'plant-2'])
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
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPhotoReminders([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })
})
