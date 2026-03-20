import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import type { UserWithSettings } from '@lily/api/repositories/engagement.repository'
import { processInactivityNudges } from '@lily/api/services/engagement-scheduler/scheduler'
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
  createdAt: daysAgo(30),
  ...overrides,
})

describe('processInactivityNudges', () => {
  it('creates notification for user inactive 7+ days', async () => {
    const user = makeUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        lastCareDates: { 'user-1': daysAgo(10) },
        plantCounts: { 'user-1': 3 },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processInactivityNudges([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('inactivity_nudge')
    expect(notifications[0]?.userId).toBe('user-1')
  })

  it('skips user with recent care (< 7 days)', async () => {
    const user = makeUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        lastCareDates: { 'user-1': daysAgo(3) },
        plantCounts: { 'user-1': 5 },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processInactivityNudges([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('skips user already notified in last 7 days', async () => {
    const user = makeUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        lastCareDates: { 'user-1': daysAgo(10) },
        plantCounts: { 'user-1': 2 },
        notificationsInPeriod: {
          'user-1:inactivity_nudge': true,
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processInactivityNudges([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('skips user with no plants', async () => {
    const user = makeUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        lastCareDates: { 'user-1': daysAgo(14) },
        plantCounts: { 'user-1': 0 },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processInactivityNudges([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('handles empty user list without errors', async () => {
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository(),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processInactivityNudges([]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(0)
  })

  it('creates notification for user with null lastCareDate', async () => {
    const user = makeUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        lastCareDates: { 'user-1': null },
        plantCounts: { 'user-1': 2 },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processInactivityNudges([user]).pipe(Effect.provide(layer))
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('inactivity_nudge')
  })

  it('handles multiple users, only eligible ones get notifications', async () => {
    const eligible = makeUser({ id: 'user-eligible' })
    const recentCare = makeUser({ id: 'user-recent' })
    const noPlants = makeUser({ id: 'user-noplants' })

    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        lastCareDates: {
          'user-eligible': daysAgo(10),
          'user-recent': daysAgo(2),
          'user-noplants': daysAgo(15),
        },
        plantCounts: {
          'user-eligible': 4,
          'user-recent': 3,
          'user-noplants': 0,
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processInactivityNudges([eligible, recentCare, noPlants]).pipe(
        Effect.provide(layer)
      )
    )

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.userId).toBe('user-eligible')
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
        lastCareDates: { 'user-1': daysAgo(10) },
        plantCounts: { 'user-1': 3 },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(
      processInactivityNudges([user]).pipe(Effect.provide(layer))
    )

    // DND window covers all hours, so notification is skipped
    expect(notifications).toHaveLength(0)
  })
})
