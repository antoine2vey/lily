import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import type { PlantAnniversary } from '@lily/api/repositories/engagement.repository'
import { processPlantAnniversaries } from '@lily/api/services/engagement-scheduler/scheduler'
import { daysAgoAsDate } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const makeAnniversaryPlant = (
  overrides: Partial<PlantAnniversary> & { plantId: string }
): PlantAnniversary => ({
  plantName: `Plant ${overrides.plantId}`,
  userId: 'user-1',
  dateAdded: daysAgoAsDate(90),
  ...overrides,
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
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantAnniversaries([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('plant_anniversary')
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
      createMockNotificationRepository(notifications)
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
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        plantsWithAnniversary: [plant],
        notificationsForPlantInPeriod: {
          'user-1:plant_anniversary:plant-1': true,
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantAnniversaries([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
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
      createMockNotificationRepository(notifications)
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
      createMockNotificationRepository(notifications)
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
      createMockNotificationRepository(notifications)
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
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantAnniversaries([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

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
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processPlantAnniversaries([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })
})
