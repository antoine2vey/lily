import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import type { TrialingUser } from '@lily/api/repositories/engagement.repository'
import { processTrialEnding } from '@lily/api/services/engagement-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import { DateTime, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const daysFromNow = (n: number) =>
  DateTime.toDateUtc(DateTime.add(DateTime.unsafeNow(), { days: n }))

const makeTrialingUser = (
  overrides: Partial<TrialingUser> & { id: string }
): TrialingUser => ({
  timezone: 'Europe/Paris',
  doNotDisturb: false,
  doNotDisturbStart: null,
  doNotDisturbEnd: null,
  language: 'en',
  trialEndsAt: daysFromNow(3),
  ...overrides,
})

describe('processTrialEnding', () => {
  it('creates notifications for both trial thresholds (3-day and 1-day)', async () => {
    // processTrialEnding loops over [3, 1], calling processUsers for each.
    // The mock returns the same users for both thresholds.
    const trialingUser = makeTrialingUser({
      id: 'user-1',
      trialEndsAt: daysFromNow(3),
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        trialingUsers: [trialingUser],
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(processTrialEnding().pipe(Effect.provide(layer)))

    // 2 notifications: one for 3-day threshold, one for 1-day threshold
    expect(notifications).toHaveLength(2)
    expect(notifications[0]?.type).toBe('trial_ending')
    expect(notifications[0]?.userId).toBe('user-1')
  })

  it('creates notifications for multiple trialing users', async () => {
    const users = [
      makeTrialingUser({ id: 'user-1' }),
      makeTrialingUser({ id: 'user-2' }),
    ]
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({ trialingUsers: users }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(processTrialEnding().pipe(Effect.provide(layer)))

    // 4 total: 2 users × 2 thresholds (3-day + 1-day)
    expect(notifications).toHaveLength(4)
    const userIds = notifications.map((n) => n.userId)
    expect(userIds).toContain('user-1')
    expect(userIds).toContain('user-2')
  })

  it('dedup: skips if already sent for this threshold', async () => {
    const trialingUser = makeTrialingUser({ id: 'user-1' })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        trialingUsers: [trialingUser],
        notificationsInPeriod: {
          'user-1:trial_ending': true,
        },
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(processTrialEnding().pipe(Effect.provide(layer)))

    expect(notifications).toHaveLength(0)
  })

  it('does nothing when no users are trialing', async () => {
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({ trialingUsers: [] }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(processTrialEnding().pipe(Effect.provide(layer)))

    expect(notifications).toHaveLength(0)
  })

  it('skips user within DND window gracefully', async () => {
    const trialingUser = makeTrialingUser({
      id: 'user-1',
      doNotDisturb: true,
      doNotDisturbStart: '00:00',
      doNotDisturbEnd: '23:59',
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        trialingUsers: [trialingUser],
      }),
      createMockNotificationRepository(notifications)
    )

    await Effect.runPromise(processTrialEnding().pipe(Effect.provide(layer)))

    expect(notifications).toHaveLength(0)
  })
})
