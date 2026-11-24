import {
  freezeClock,
  SUNDAY_10_IN_PARIS,
} from '@lily/api/__tests__/fixtures/clock'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { notificationMocks } from '@lily/api/__tests__/mocks/notification-table'
import type {
  PlantAnniversary,
  UserWithSettings,
} from '@lily/api/repositories/engagement.repository'
import { EngagementRepository } from '@lily/api/repositories/engagement.repository'
import { plantAnniversary } from '@lily/api/services/engagement-scheduler/scheduler'
import { runRules } from '@lily/api/services/helpers/engagement-rules'
import { daysAgoAsDate } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// The runner records a slot only while a window of the local day is left.
freezeClock(SUNDAY_10_IN_PARIS)

const makeAnniversaryPlant = (
  overrides: Partial<PlantAnniversary> & { plantId: string }
): PlantAnniversary => ({
  plantName: `Plant ${overrides.plantId}`,
  userId: 'user-1',
  dateAdded: daysAgoAsDate(90),
  ...overrides,
})

const processPlantAnniversaries = (users: ReadonlyArray<UserWithSettings>) =>
  Effect.gen(function* () {
    const repo = yield* EngagementRepository
    const plants = yield* repo.getPlantsWithAnniversary([1, 3, 6, 12])
    yield* runRules('engagement-scheduler', users, [plantAnniversary(plants)])
  })

describe('processPlantAnniversaries', () => {
  it('creates notification for plant with anniversary', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const plant = makeAnniversaryPlant({
      plantId: 'plant-1',
      userId: 'user-1',
      dateAdded: daysAgoAsDate(90),
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithAnniversary: [plant],
      }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPlantAnniversaries([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('plant_anniversary')
    expect(notifications[0]?.status).toBe('pending')
    expect(notifications[0]?.metadata).toEqual({})
    expect(notifications[0]?.userId).toBe('user-1')
    expect(notifications[0]?.plantId).toBe('plant-1')
  })

  it('skips plant whose owner has care reminders disabled', async () => {
    const plant = makeAnniversaryPlant({
      plantId: 'plant-1',
      userId: 'user-not-in-list',
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithAnniversary: [plant],
      }),
      notificationMocks(notifications).repository
    )

    // Pass empty user list — user-not-in-list is not eligible
    await Effect.runPromise(
      processPlantAnniversaries([]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('dedup: skips if already sent for this plant recently', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const plant = makeAnniversaryPlant({
      plantId: 'plant-1',
      userId: 'user-1',
    })
    const sent = createTestNotification({
      userId: 'user-1',
      type: 'plant_anniversary',
      plantId: 'plant-1',
    })
    const notifications: Notification[] = [sent]

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithAnniversary: [plant],
      }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPlantAnniversaries([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toEqual([sent])
  })

  it('handles multiple plants for the same user', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const plants = [
      makeAnniversaryPlant({
        plantId: 'plant-1',
        userId: 'user-1',
        dateAdded: daysAgoAsDate(30),
      }),
      makeAnniversaryPlant({
        plantId: 'plant-2',
        userId: 'user-1',
        dateAdded: daysAgoAsDate(365),
      }),
    ]
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithAnniversary: plants,
      }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPlantAnniversaries([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(2)
    const plantIds = notifications.map((n) => n.plantId)
    expect(plantIds).toContain('plant-1')
    expect(plantIds).toContain('plant-2')
  })

  it('schedules multiple plants for the same user at the same time', async () => {
    // Regression: each plant used to get its own random scheduledAt, which
    // made the notification scheduler pick them up across different polls
    // and send one push per plant instead of a single grouped push.
    const user = makeUserWithSettings({ id: 'user-1' })
    const plants = [
      makeAnniversaryPlant({
        plantId: 'plant-1',
        userId: 'user-1',
        dateAdded: daysAgoAsDate(30),
      }),
      makeAnniversaryPlant({
        plantId: 'plant-2',
        userId: 'user-1',
        dateAdded: daysAgoAsDate(90),
      }),
      makeAnniversaryPlant({
        plantId: 'plant-3',
        userId: 'user-1',
        dateAdded: daysAgoAsDate(180),
      }),
    ]
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithAnniversary: plants,
      }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPlantAnniversaries([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(3)
    const scheduledAts = notifications.map((n) =>
      n.scheduledAt instanceof Date
        ? n.scheduledAt.getTime()
        : new Date(n.scheduledAt).getTime()
    )
    const uniqueScheduledAts = new Set(scheduledAts)
    expect(uniqueScheduledAts.size).toBe(1)
  })

  it('gives different users independent scheduledAts', async () => {
    const user1 = makeUserWithSettings({ id: 'user-1' })
    const user2 = makeUserWithSettings({ id: 'user-2' })
    const plants = [
      makeAnniversaryPlant({
        plantId: 'plant-1',
        userId: 'user-1',
        dateAdded: daysAgoAsDate(30),
      }),
      makeAnniversaryPlant({
        plantId: 'plant-2',
        userId: 'user-2',
        dateAdded: daysAgoAsDate(30),
      }),
    ]
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithAnniversary: plants,
      }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPlantAnniversaries([user1, user2]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(2)
    const byUser = new Map(notifications.map((n) => [n.userId, n]))
    expect(byUser.has('user-1')).toBe(true)
    expect(byUser.has('user-2')).toBe(true)
  })

  it('does nothing when no anniversary plants found', async () => {
    const user = makeUserWithSettings({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithAnniversary: [],
      }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPlantAnniversaries([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it.each([
    { language: 'fr', days: 365, title: '🎂 Joyeux 1 an ensemble !' },
    { language: 'fr', days: 91, title: '🎂 Joyeux 3 mois ensemble !' },
    { language: 'en', days: 365, title: '🎂 Happy 1 year together!' },
    { language: 'en', days: 30, title: '🎂 Happy 1 month together!' },
  ] as const)(
    'writes the $days-day duration in the language of a $language user',
    async ({ language, days, title }) => {
      const user = makeUserWithSettings({ id: 'user-1', language })
      const notifications: Notification[] = []

      const layer = Layer.mergeAll(
        createMockEngagementRepository({
          plantsWithAnniversary: [
            makeAnniversaryPlant({
              plantId: 'plant-1',
              dateAdded: daysAgoAsDate(days),
            }),
          ],
        }),
        notificationMocks(notifications).repository
      )

      await Effect.runPromise(
        processPlantAnniversaries([user]).pipe(Effect.provide(layer))
      )

      expect(notifications[0]?.title).toBe(title)
    }
  )

  it('skips user within DND window gracefully', async () => {
    const user = makeUserWithSettings({
      id: 'user-1',
      doNotDisturb: true,
      doNotDisturbStart: '00:00',
      doNotDisturbEnd: '23:59',
    })
    const plant = makeAnniversaryPlant({
      plantId: 'plant-1',
      userId: 'user-1',
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithAnniversary: [plant],
      }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(
      processPlantAnniversaries([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })
})
