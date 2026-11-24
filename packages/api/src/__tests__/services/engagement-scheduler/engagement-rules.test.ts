import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { makeUserWithSettings } from '@lily/api/__tests__/fixtures/users'
import { createMockAchievementRepository } from '@lily/api/__tests__/mocks/achievement.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockEngagementRepository } from '@lily/api/__tests__/mocks/engagement.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import type {
  PlantAnniversary,
  PlantWithoutRecentPhoto,
  TrialingUser,
} from '@lily/api/repositories/engagement.repository'
import type { NotificationRow } from '@lily/api/repositories/notification.repository'
import { checkAndCreateEngagementNotifications } from '@lily/api/services/engagement-scheduler/scheduler'
import { checkAndCreateWeeklyRecap } from '@lily/api/services/weekly-recap-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import type { NotificationTopic } from '@lily/shared/server'
import { Array, Effect, Layer, Order, Random } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Sunday 20:30 in Paris, Monday 08:30 in Kiritimati (UTC+14).
const NOW = new Date('2026-06-14T18:30:00.000Z')
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const ago = (ms: number) => new Date(NOW.getTime() - ms)

// 0.75 picks the evening window, 20:00 local unless do-not-disturb covers it.
const fixedRoll: Random.Random = {
  nextDoubleUnsafe: () => 0.75,
  nextIntUnsafe: () => 0,
}

const seeded = (
  userId: string,
  type: NotificationTopic,
  createdAt: Date,
  extra: Partial<Notification> = {}
): NotificationRow => ({
  ...createTestNotification({ userId, createdAt, ...extra }),
  type,
})

const recordedSince = (rows: ReadonlyArray<NotificationRow>, before: number) =>
  Array.sort(
    Array.map(Array.drop(rows, before), (n) => ({
      userId: n.userId,
      type: n.type,
      plantId: n.plantId ?? null,
      status: n.status,
      params: n.params,
      title: n.title,
      body: n.body,
      scheduledAt: n.scheduledAt.toISOString(),
    })),
    Order.mapInput(
      Order.String,
      (n: { userId: string; type: string; plantId: string | null }) =>
        [n.userId, n.type, n.plantId ?? ''].join(' ')
    )
  )

describe('engagement rules, pinned on a fixed clock and roll', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records the same nudges, params and slots for every engagement rule', async () => {
    const joined = ago(40 * DAY)
    const user = (id: string, extra = {}) =>
      makeUserWithSettings({ id, createdAt: joined, ...extra })
    const users = [
      user('inactive'),
      user('inactive-dnd-evening', {
        doNotDisturb: true,
        doNotDisturbStart: '17:00',
        doNotDisturbEnd: '23:00',
      }),
      user('inactive-dnd-all-day', {
        doNotDisturb: true,
        doNotDisturbStart: '00:00',
        doNotDisturbEnd: '23:59',
      }),
      user('inactive-no-zone', { timezone: null }),
      user('inactive-nudged-inside'),
      user('inactive-nudged-outside'),
      user('inactive-nudge-failed'),
      user('cared-recently'),
      user('on-vacation', {
        vacationStatus: 'active',
        vacationStart: ago(2 * DAY),
        vacationEnd: new Date(NOW.getTime() + 5 * DAY),
      }),
      user('joined-30', { createdAt: ago(30 * DAY + 60 * MINUTE) }),
      user('joined-30-celebrated', {
        createdAt: ago(30 * DAY + 60 * MINUTE),
      }),
      user('photo-stale'),
      user('streak-5'),
      user('streak-5-cared-today'),
      user('streak-5-warned-today'),
      user('streak-5-warned-yesterday'),
      user('streak-5-kiritimati', { timezone: 'Pacific/Kiritimati' }),
      user('streak-2'),
      user('streak-7'),
      user('streak-14-celebrated'),
      user('anniversary-fr', { language: 'fr' }),
    ]

    const rows: NotificationRow[] = [
      seeded(
        'inactive-nudged-inside',
        'inactivity_nudge',
        ago(7 * DAY - MINUTE)
      ),
      seeded(
        'inactive-nudged-outside',
        'inactivity_nudge',
        ago(7 * DAY + MINUTE)
      ),
      seeded('inactive-nudge-failed', 'inactivity_nudge', ago(DAY), {
        status: 'failed',
      }),
      seeded(
        'joined-30-celebrated',
        'plant_parent_milestone',
        ago(31 * DAY - MINUTE)
      ),
      seeded('photo-stale', 'photo_reminder', ago(29 * DAY), {
        plantId: 'plant-photo-recent-reminder',
      }),
      seeded('photo-stale', 'photo_reminder', ago(31 * DAY), {
        plantId: 'plant-photo-old-reminder',
      }),
      // 00:30 on Sunday in Paris, still Saturday in UTC.
      seeded(
        'streak-5-warned-today',
        'streak_at_risk',
        new Date('2026-06-13T22:30:00.000Z')
      ),
      // 23:30 on Saturday in Paris.
      seeded(
        'streak-5-warned-yesterday',
        'streak_at_risk',
        new Date('2026-06-13T21:30:00.000Z')
      ),
      seeded('streak-7', 'streak_milestone', ago(8 * DAY + MINUTE)),
      seeded(
        'streak-14-celebrated',
        'streak_milestone',
        ago(15 * DAY - MINUTE)
      ),
      seeded('trial-dup-3', 'trial_ending', ago(4 * DAY - MINUTE)),
      seeded('anniversary-fr', 'plant_anniversary', ago(31 * DAY), {
        plantId: 'plant-anniversary-dup',
      }),
    ]
    const before = rows.length

    const careLogs = (id: string) => ({ [id]: ago(10 * DAY) })
    const plantsWithoutRecentPhoto: Record<
      string,
      ReadonlyArray<PlantWithoutRecentPhoto>
    > = {
      'photo-stale': [
        {
          plantId: 'plant-photo-recent-reminder',
          plantName: 'Fern',
          userId: 'photo-stale',
          lastPhotoAt: ago(40 * DAY),
          dateAdded: ago(100 * DAY),
        },
        {
          plantId: 'plant-photo-old-reminder',
          plantName: 'Calathea',
          userId: 'photo-stale',
          lastPhotoAt: ago(45 * DAY),
          dateAdded: ago(100 * DAY),
        },
        {
          plantId: 'plant-photo-never',
          plantName: 'Pothos',
          userId: 'photo-stale',
          lastPhotoAt: null,
          dateAdded: ago(60 * DAY),
        },
      ],
    }
    const trialingUsers: ReadonlyArray<TrialingUser> = [
      {
        id: 'trial',
        timezone: 'Europe/Paris',
        doNotDisturb: false,
        doNotDisturbStart: null,
        doNotDisturbEnd: null,
        language: 'en',
        trialEndsAt: new Date(NOW.getTime() + 3 * DAY),
      },
      {
        id: 'trial-dup-3',
        timezone: 'America/New_York',
        doNotDisturb: false,
        doNotDisturbStart: null,
        doNotDisturbEnd: null,
        language: 'fr',
        trialEndsAt: new Date(NOW.getTime() + 3 * DAY),
      },
    ]
    const plantsWithAnniversary: ReadonlyArray<PlantAnniversary> = [
      {
        plantId: 'plant-anniversary-year',
        plantName: 'Ficus',
        userId: 'anniversary-fr',
        dateAdded: new Date('2025-06-14T09:00:00.000Z'),
      },
      {
        plantId: 'plant-anniversary-quarter',
        plantName: 'Aloe',
        userId: 'anniversary-fr',
        dateAdded: new Date('2026-03-14T09:00:00.000Z'),
      },
      {
        plantId: 'plant-anniversary-dup',
        plantName: 'Cactus',
        userId: 'anniversary-fr',
        dateAdded: new Date('2026-05-14T09:00:00.000Z'),
      },
      {
        plantId: 'plant-anniversary-stranger',
        plantName: 'Palm',
        userId: 'not-an-audience-member',
        dateAdded: new Date('2025-06-14T09:00:00.000Z'),
      },
    ]

    const layer = Layer.mergeAll(
      createMockNotificationRepository(rows),
      createMockEngagementRepository({
        usersWithTips: users,
        notifications: rows,
        lastCareDates: {
          ...careLogs('inactive'),
          ...careLogs('inactive-dnd-evening'),
          ...careLogs('inactive-dnd-all-day'),
          ...careLogs('inactive-no-zone'),
          ...careLogs('inactive-nudged-inside'),
          ...careLogs('inactive-nudged-outside'),
          ...careLogs('inactive-nudge-failed'),
          'cared-recently': ago(2 * DAY),
        },
        plantCounts: {
          inactive: 2,
          'inactive-dnd-evening': 1,
          'inactive-dnd-all-day': 1,
          'inactive-no-zone': 4,
          'inactive-nudged-inside': 1,
          'inactive-nudged-outside': 1,
          'inactive-nudge-failed': 1,
          'cared-recently': 3,
        },
        plantNames: { 'streak-5': ['Monstera', 'Pilea'] },
        plantsWithoutRecentPhoto,
        trialingUsers,
        plantsWithAnniversary,
      }),
      createMockCareLogRepository([], {
        performedTodayCountByUser: { 'streak-5-cared-today': 1 },
      }),
      createMockAchievementRepository({
        achievements: [],
        batchCareStreaks: new Map([
          ['streak-5', 5],
          ['streak-5-cared-today', 5],
          ['streak-5-warned-today', 5],
          ['streak-5-warned-yesterday', 5],
          ['streak-5-kiritimati', 5],
          ['streak-2', 2],
          ['streak-7', 7],
          ['streak-14-celebrated', 14],
        ]),
      })
    )

    await Effect.runPromise(
      checkAndCreateEngagementNotifications.pipe(
        Effect.provide(layer),
        Effect.provideService(Random.Random, fixedRoll)
      )
    )

    expect(recordedSince(rows, before)).toMatchInlineSnapshot(`
      [
        {
          "body": "Tu prends soin de ta Aloe depuis le 14 mars 2026. Encore plein d'autres à venir ! 🌿",
          "params": {
            "anniversaryMonths": 3,
            "dateAdded": "14 mars 2026",
            "plantName": "Aloe",
          },
          "plantId": "plant-anniversary-quarter",
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🎂 Joyeux 3 mois ensemble !",
          "type": "plant_anniversary",
          "userId": "anniversary-fr",
        },
        {
          "body": "Tu prends soin de ta Ficus depuis le 14 juin 2025. Encore plein d'autres à venir ! 🌿",
          "params": {
            "anniversaryMonths": 12,
            "dateAdded": "14 juin 2025",
            "plantName": "Ficus",
          },
          "plantId": "plant-anniversary-year",
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🎂 Joyeux 1 an ensemble !",
          "type": "plant_anniversary",
          "userId": "anniversary-fr",
        },
        {
          "body": "It's been a while! Your 2 plants would love a little attention.",
          "params": {
            "plantCount": 2,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🌿 Your plants miss you!",
          "type": "inactivity_nudge",
          "userId": "inactive",
        },
        {
          "body": "It's been a while! Your plant would love a little attention.",
          "params": {
            "plantCount": 1,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T05:00:00.000Z",
          "status": "pending",
          "title": "🌿 Your plants miss you!",
          "type": "inactivity_nudge",
          "userId": "inactive-dnd-evening",
        },
        {
          "body": "It's been a while! Your 4 plants would love a little attention.",
          "params": {
            "plantCount": 4,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T20:00:00.000Z",
          "status": "pending",
          "title": "🌿 Your plants miss you!",
          "type": "inactivity_nudge",
          "userId": "inactive-no-zone",
        },
        {
          "body": "It's been a while! Your plant would love a little attention.",
          "params": {
            "plantCount": 1,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🌿 Your plants miss you!",
          "type": "inactivity_nudge",
          "userId": "inactive-nudge-failed",
        },
        {
          "body": "It's been a while! Your plant would love a little attention.",
          "params": {
            "plantCount": 1,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🌿 Your plants miss you!",
          "type": "inactivity_nudge",
          "userId": "inactive-nudged-outside",
        },
        {
          "body": "You joined Lily 30 days ago. Your plants are lucky to have you! 🌿",
          "params": {
            "daysSinceJoin": 30,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🎂 30 days as a plant parent!",
          "type": "plant_parent_milestone",
          "userId": "joined-30",
        },
        {
          "body": "Your Pothos hasn't had a photo in 60 days. Capture how far it's come!",
          "params": {
            "daysSincePhoto": 60,
            "plantName": "Pothos",
          },
          "plantId": "plant-photo-never",
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "📸 Time for a growth update!",
          "type": "photo_reminder",
          "userId": "photo-stale",
        },
        {
          "body": "Your Calathea hasn't had a photo in 45 days. Capture how far it's come!",
          "params": {
            "daysSincePhoto": 45,
            "plantName": "Calathea",
          },
          "plantId": "plant-photo-old-reminder",
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "📸 Time for a growth update!",
          "type": "photo_reminder",
          "userId": "photo-stale",
        },
        {
          "body": "Your plants still need care today. Keep the streak alive!",
          "params": {
            "streakCount": 14,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🔥 Don't lose your 14-day streak!",
          "type": "streak_at_risk",
          "userId": "streak-14-celebrated",
        },
        {
          "body": "Your Monstera still needs care today. Keep the streak alive!",
          "params": {
            "plantName": "Monstera",
            "streakCount": 5,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🔥 Don't lose your 5-day streak!",
          "type": "streak_at_risk",
          "userId": "streak-5",
        },
        {
          "body": "Your plants still need care today. Keep the streak alive!",
          "params": {
            "streakCount": 5,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🔥 Don't lose your 5-day streak!",
          "type": "streak_at_risk",
          "userId": "streak-5-warned-yesterday",
        },
        {
          "body": "Your plants still need care today. Keep the streak alive!",
          "params": {
            "streakCount": 7,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🔥 Don't lose your 7-day streak!",
          "type": "streak_at_risk",
          "userId": "streak-7",
        },
        {
          "body": "You've cared for your plants 7 days straight. That's real dedication! 🌟",
          "params": {
            "streakCount": 7,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "🔥 7-day streak!",
          "type": "streak_milestone",
          "userId": "streak-7",
        },
        {
          "body": "Just 3 days left of your trial. Keep unlimited plants, AI advice, and care delegation!",
          "params": {
            "trialDaysLeft": 3,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "⏳ Your Premium trial is ending soon",
          "type": "trial_ending",
          "userId": "trial",
        },
        {
          "body": "Plus que 1 jour d'essai. Garde plantes illimitées, conseils IA et délégation !",
          "params": {
            "trialDaysLeft": 1,
          },
          "plantId": null,
          "scheduledAt": "2026-06-15T00:00:00.000Z",
          "status": "pending",
          "title": "⏳ Ton essai Premium se termine bientôt",
          "type": "trial_ending",
          "userId": "trial-dup-3",
        },
      ]
    `)
  })

  it('records the same weekly recaps, params and slots', async () => {
    const users = [
      makeUserWithSettings({ id: 'recap' }),
      makeUserWithSettings({ id: 'recap-fr', language: 'fr' }),
      makeUserWithSettings({
        id: 'recap-monday',
        timezone: 'Pacific/Kiritimati',
      }),
      makeUserWithSettings({ id: 'recap-sent-inside' }),
      makeUserWithSettings({ id: 'recap-sent-outside' }),
    ]
    const rows: NotificationRow[] = [
      seeded('recap-sent-inside', 'weekly_recap', ago(6 * DAY - MINUTE)),
      seeded('recap-sent-outside', 'weekly_recap', ago(6 * DAY + MINUTE)),
    ]
    const before = rows.length

    const layer = Layer.mergeAll(
      createMockNotificationRepository(rows),
      createMockEngagementRepository({
        usersWithTips: users,
        notifications: rows,
        careLogsForWeek: {
          recap: 8,
          'recap-fr': 3,
          'recap-monday': 8,
          'recap-sent-inside': 8,
          'recap-sent-outside': 8,
        },
        healthyPlantCounts: { recap: 5, 'recap-fr': 2 },
      }),
      createMockAchievementRepository({ achievements: [], careStreak: 4 })
    )

    await Effect.runPromise(
      checkAndCreateWeeklyRecap.pipe(
        Effect.provide(layer),
        Effect.provideService(Random.Random, fixedRoll)
      )
    )

    expect(recordedSince(rows, before)).toMatchInlineSnapshot(`
      [
        {
          "body": "What a week! 8 care tasks done, a 4-day streak going, and 5 plants thriving. 🌿",
          "params": {
            "healthyCount": 5,
            "streakCount": 4,
            "tasksCompleted": 8,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "📊 Your weekly plant recap",
          "type": "weekly_recap",
          "userId": "recap",
        },
        {
          "body": "Quelle semaine ! 4 jours de série, 3 soins et 2 plantes en pleine forme. 🌿",
          "params": {
            "healthyCount": 2,
            "streakCount": 4,
            "tasksCompleted": 3,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "📊 Ton récap hebdomadaire",
          "type": "weekly_recap",
          "userId": "recap-fr",
        },
        {
          "body": "What a week! 8 care tasks done and a 4-day streak going. 🌿",
          "params": {
            "healthyCount": 0,
            "streakCount": 4,
            "tasksCompleted": 8,
          },
          "plantId": null,
          "scheduledAt": "2026-06-14T18:00:00.000Z",
          "status": "pending",
          "title": "📊 Your weekly plant recap",
          "type": "weekly_recap",
          "userId": "recap-sent-outside",
        },
      ]
    `)
  })
})
