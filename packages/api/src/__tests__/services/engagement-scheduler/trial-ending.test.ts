import {
  freezeClock,
  SUNDAY_10_IN_PARIS,
} from '@lily/api/__tests__/fixtures/clock'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { notificationMocks } from '@lily/api/__tests__/mocks/notification-table'
import type { TrialingUser } from '@lily/api/repositories/engagement.repository'
import { checkAndCreateEngagementNotifications } from '@lily/api/services/engagement-scheduler/scheduler'
import { ZoneName } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { DateTime, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// The runner records a slot only while a window of the local day is left.
freezeClock(SUNDAY_10_IN_PARIS)

const daysFromNow = (n: number) =>
  DateTime.toDateUtc(DateTime.add(DateTime.nowUnsafe(), { days: n }))

const makeTrialingUser = (
  overrides: Partial<TrialingUser> & { id: string }
): TrialingUser => ({
  timezone: ZoneName.make('Europe/Paris'),
  doNotDisturb: false,
  doNotDisturbStart: null,
  doNotDisturbEnd: null,
  language: 'en',
  trialEndsAt: daysFromNow(3),
  ...overrides,
})

// No user has tips or care reminders on, so the task runs only the trial rule.
const processTrialEnding = checkAndCreateEngagementNotifications.pipe(
  Effect.provide(
    Layer.mergeAll(
      createMockAchievementRepository({ achievements: [] }),
      createMockCareLogRepository([])
    )
  )
)

describe('trial ending', () => {
  it('tells a user once when both thresholds list them: the 1-day pass sees the 3-day row', async () => {
    const trialingUser = makeTrialingUser({
      id: 'user-1',
      trialEndsAt: daysFromNow(3),
    })
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        trialingUsers: [trialingUser],
      }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(processTrialEnding.pipe(Effect.provide(layer)))

    expect(notifications).toMatchObject([
      {
        type: 'trial_ending',
        userId: 'user-1',
        status: 'pending',
        metadata: {},
        params: { trialDaysLeft: 3 },
      },
    ])
  })

  it('creates one notification per trialing user', async () => {
    const users = [
      makeTrialingUser({ id: 'user-1' }),
      makeTrialingUser({ id: 'user-2' }),
    ]
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({ trialingUsers: users }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(processTrialEnding.pipe(Effect.provide(layer)))

    expect(notifications.map((n) => n.userId).sort()).toEqual([
      'user-1',
      'user-2',
    ])
  })

  it('dedup: skips if already sent for this threshold', async () => {
    const trialingUser = makeTrialingUser({ id: 'user-1' })
    const sent = createTestNotification({
      userId: 'user-1',
      type: 'trial_ending',
    })
    const notifications: Notification[] = [sent]

    const layer = Layer.mergeAll(
      createMockEngagementRepository({
        trialingUsers: [trialingUser],
      }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(processTrialEnding.pipe(Effect.provide(layer)))

    expect(notifications).toEqual([sent])
  })

  it('does nothing when no users are trialing', async () => {
    const notifications: Notification[] = []

    const layer = Layer.mergeAll(
      createMockEngagementRepository({ trialingUsers: [] }),
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(processTrialEnding.pipe(Effect.provide(layer)))

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
      notificationMocks(notifications).repository
    )

    await Effect.runPromise(processTrialEnding.pipe(Effect.provide(layer)))

    expect(notifications).toHaveLength(0)
  })
})
