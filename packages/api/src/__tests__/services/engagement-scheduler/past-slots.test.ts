import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { notificationMocks } from '@lily/api/__tests__/mocks/notification-table'
import type { AchievementRepository } from '@lily/api/repositories/achievement.repository'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type {
  EngagementRepository,
  TrialingUser,
} from '@lily/api/repositories/engagement.repository'
import type { NotificationRow } from '@lily/api/repositories/helpers/notification-row'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  inactivityNudge,
  photoReminder,
  plantAnniversary,
  plantParentMilestone,
  streakAtRisk,
  streakMilestone,
  trialEnding,
} from '@lily/api/services/engagement-scheduler/scheduler'
import { runRules } from '@lily/api/services/helpers/engagement-rules'
import { weeklyRecap } from '@lily/api/services/weekly-recap-scheduler/scheduler'
import { ZoneName } from '@lily/shared'
import { Array, Effect, Layer, Random } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

// Sunday in Paris (UTC+2), where every user of this file lives.
const SUNDAY_09_30 = new Date('2026-06-14T07:30:00.000Z')
const SUNDAY_18_30 = new Date('2026-06-14T16:30:00.000Z')
const SUNDAY_23_30 = new Date('2026-06-14T21:30:00.000Z')
const MONDAY_00_00 = new Date('2026-06-14T22:00:00.000Z')
const MONDAY_00_30 = new Date('2026-06-14T22:30:00.000Z')

// A roll under 0.5 prefers the morning window, and its distance from the
// bound places the slot inside the window: both of these land on the middle.
const MORNING = 0.25
const EVENING = 0.75

const rolling = (roll: number): Random.Random => ({
  nextDoubleUnsafe: () => roll,
  nextIntUnsafe: () => 0,
})

const USER = 'user-1'

type Repositories =
  | AchievementRepository
  | CareLogRepository
  | EngagementRepository
  | NotificationRepository

// One user every rule owes a notification to, at any hour of the Sunday.
const user = makeUserWithSettings({
  id: USER,
  createdAt: new Date(SUNDAY_09_30.getTime() - 30 * DAY - 60 * MINUTE),
})
const trialing: TrialingUser = {
  id: USER,
  timezone: ZoneName.make('Europe/Paris'),
  doNotDisturb: false,
  doNotDisturbStart: null,
  doNotDisturbEnd: null,
  language: 'en',
  trialEndsAt: new Date(SUNDAY_23_30.getTime() + 3 * DAY),
}
const streaks = new Map([[USER, 7]])
const anniversaries = [
  {
    plantId: 'plant-1',
    plantName: 'Ficus',
    userId: USER,
    dateAdded: new Date('2025-06-14T09:00:00.000Z'),
  },
]

const ENGAGEMENT = 'engagement-scheduler'
const rules: Record<string, Effect.Effect<void, never, Repositories>> = {
  inactivity: runRules(ENGAGEMENT, [user], [inactivityNudge]),
  photo_reminder: runRules(ENGAGEMENT, [user], [photoReminder]),
  milestone: runRules(ENGAGEMENT, [user], [plantParentMilestone]),
  streak_at_risk: runRules(ENGAGEMENT, [user], [streakAtRisk(streaks)]),
  streak_milestone: runRules(ENGAGEMENT, [user], [streakMilestone(streaks)]),
  plant_anniversary: runRules(
    ENGAGEMENT,
    [user],
    [plantAnniversary(anniversaries)]
  ),
  trial_ending: runRules(ENGAGEMENT, [trialing], [trialEnding(3)]),
  weekly_recap: runRules('weekly-recap-scheduler', [user], [weeklyRecap]),
}

const run = async (
  now: Date,
  roll: number,
  rule: string,
  rows: NotificationRow[] = []
) => {
  vi.setSystemTime(now)
  const ago = (ms: number) => new Date(now.getTime() - ms)
  const layer = Layer.mergeAll(
    notificationMocks(rows).repository,
    createMockEngagementRepository({
      notifications: rows,
      lastCareDates: { [USER]: ago(10 * DAY) },
      plantCounts: { [USER]: 2 },
      plantNames: { [USER]: ['Monstera'] },
      plantsWithoutRecentPhoto: {
        [USER]: [
          {
            plantId: 'plant-1',
            plantName: 'Pothos',
            userId: USER,
            lastPhotoAt: null,
            dateAdded: ago(60 * DAY),
          },
        ],
      },
      careLogsForWeek: { [USER]: 8 },
      healthyPlantCounts: { [USER]: 2 },
    }),
    createMockCareLogRepository([]),
    createMockAchievementRepository({ achievements: [], careStreak: 7 })
  )
  await Effect.runPromise(
    Effect.suspend(() => rules[rule] ?? Effect.die(`no rule ${rule}`)).pipe(
      Effect.provide(layer),
      Effect.provideService(Random.Random, rolling(roll))
    )
  )
  return Array.map(rows, (n) => `${n.type} ${n.scheduledAt.toISOString()}`)
}

describe('a slot is never in the past', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(Object.keys(rules))(
    '%s records nothing at 23:30 local, after both windows of the day',
    async (rule) => {
      expect([
        ...(await run(SUNDAY_23_30, MORNING, rule)),
        ...(await run(SUNDAY_23_30, EVENING, rule)),
      ]).toEqual([])
    }
  )

  it.each([
    ['inactivity', 'inactivity_nudge'],
    ['photo_reminder', 'photo_reminder'],
    ['milestone', 'plant_parent_milestone'],
    ['streak_milestone', 'streak_milestone'],
    ['plant_anniversary', 'plant_anniversary'],
    ['trial_ending', 'trial_ending'],
    ['weekly_recap', 'weekly_recap'],
  ])(
    '%s takes the evening window at 09:30 local, the morning one being over',
    async (rule, topic) => {
      expect(await run(SUNDAY_09_30, MORNING, rule)).toEqual([
        `${topic} 2026-06-14T18:00:00.000Z`,
      ])
    }
  )

  it('draws the slot from what is left of a window under way', async () => {
    // The middle of 18:31 to 22:00.
    expect(await run(SUNDAY_18_30, MORNING, 'streak_at_risk')).toEqual([
      'streak_at_risk 2026-06-14T18:15:00.000Z',
    ])
  })

  it('starts what is left at the next minute', async () => {
    expect(await run(SUNDAY_18_30, 0.5, 'inactivity')).toEqual([
      'inactivity_nudge 2026-06-14T16:31:00.000Z',
    ])
  })

  it('picks a user skipped at 23:30 up again after local midnight', async () => {
    const rows: NotificationRow[] = []
    await run(SUNDAY_23_30, EVENING, 'inactivity', rows)

    expect(await run(MONDAY_00_30, EVENING, 'inactivity', rows)).toEqual([
      'inactivity_nudge 2026-06-15T18:00:00.000Z',
    ])
  })

  it('keeps both windows whole at local midnight', async () => {
    expect([
      ...(await run(MONDAY_00_00, MORNING, 'inactivity')),
      ...(await run(MONDAY_00_00, EVENING, 'inactivity')),
    ]).toEqual([
      'inactivity_nudge 2026-06-15T05:00:00.000Z',
      'inactivity_nudge 2026-06-15T18:00:00.000Z',
    ])
  })
})
