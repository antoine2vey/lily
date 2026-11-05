import { inspect } from 'node:util'
import { createTestMembership } from '@lily/api/__tests__/fixtures/canopies'
import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestDeviceToken,
  mockDeviceTokens,
} from '@lily/api/__tests__/fixtures/device-tokens'
import { createTestNotification as createRow } from '@lily/api/__tests__/fixtures/notifications'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import {
  createMockAlerter,
  MockAlerterLive,
} from '@lily/api/__tests__/mocks/alerter'
import {
  createCanopyStore,
  createMockCanopyRepository,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import {
  createMockDeadLetterRepository,
  createMockDeadLetterRepositoryWithCapture,
} from '@lily/api/__tests__/mocks/dead-letter.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import {
  createFailingPushService,
  createMockPushService,
  createSuccessPushService,
  type MockPushServiceOptions,
} from '@lily/api/__tests__/mocks/push.service'
import {
  createInMemoryRedis,
  createInMemoryRedisQueue,
} from '@lily/api/__tests__/mocks/redis-queue'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import {
  type CreateDeadLetterData,
  DeadLetterRepository,
} from '@lily/api/repositories/dead-letter.repository'
import type {
  DelegationRepository,
  DelegationRow,
} from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { Alerter } from '@lily/api/services/alerting'
import {
  type AlertEvent,
  makeAlerter,
} from '@lily/api/services/alerting/service'
import { decodeQueueEntry } from '@lily/api/services/message-queue/redis.provider'
import {
  buildCareDigestContent,
  buildGroupedPlantAnniversaryContent,
  buildSimpleContent,
} from '@lily/api/services/notification-scheduler/translations'
import {
  CLAIM_REFRESH_INTERVAL,
  consumeNext,
  processMessage,
  recoverStrandedDeliveries,
  startNotificationWorker,
  VISIBILITY_TIMEOUT,
} from '@lily/api/services/notification-scheduler/worker'
import type { ActivityPushToken, CanopyId } from '@lily/shared'
import type { DeviceToken } from '@lily/shared/device-token'
import type { Notification } from '@lily/shared/notification'
import {
  type LiveActivityPushMessage,
  MAX_NOTIFICATION_IDS,
  MessageQueue,
  type NotificationTopic,
  PushConfigError,
  type PushMessage,
  PushSendError,
  PushService,
  type PushTicket,
  type PushTicketErrorCode,
  PushTokenInvalidatedError,
  type QueueMessage,
  QueueOperationError,
} from '@lily/shared/server'
import {
  Array,
  Cause,
  Clock,
  ConfigProvider,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Logger,
  Option,
  pipe,
  Record,
  References,
  Scope,
  Struct,
} from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { TestClock } from 'effect/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Empty mocks for the Live Activity path — worker unconditionally reads
// these repos when TOPIC_CATEGORY[topic] === 'care'. With no tokens seeded,
// the LA helper returns early and the care banner path is unchanged.
const LaMocksLive = Layer.mergeAll(
  MockSqlClientLive,
  createMockActivityPushTokenRepository(),
  createMockCareScheduleRepository(),
  createMockCareLogRepository([]),
  createMockUserRepository([]),
  createMockDelegationRepository(),
  createMockCanopyRepository([
    createTestMembership({
      userId: 'user-1',
      canopyId: 'canopy-1' as CanopyId,
    }),
  ])
)

// Every plant id the queue-message fixtures reference, all living. The
// worker drops a care message whose plants are all dead, so tests that
// exercise the happy path must be able to resolve their plants.
const LivingPlantsLive = createMockPlantRepository({
  plants: [
    createTestPlant({ id: 'plant-1', userId: 'user-1' }),
    createTestPlant({ id: 'plant-2', userId: 'user-1' }),
    createTestPlant({ id: 'plant-3', userId: 'user-1' }),
    createTestPlant({ id: 'plant-123', userId: 'user-1' }),
    createTestPlant({ id: 'plant-mixed', userId: 'mixed-device-user' }),
    createTestPlant({ id: 'plant-three', userId: 'three-device-user' }),
    createTestPlant({ id: 'plant-user-2', userId: 'user-2' }),
  ],
})

const createPlantRow: typeof createRow = (overrides) =>
  createRow({ plantId: 'plant-1', ...overrides })

// The queue boundary only accepts UUID notification ids.
const rowId = (label: string) =>
  `00000000-0000-4000-8000-${Buffer.from(label).toString('hex').padStart(12, '0')}`

// Helper to create a test queue message
const createTestQueueMessage = (
  overrides: Partial<QueueMessage> = {}
): QueueMessage => ({
  id: `msg-${crypto.randomUUID()}`,
  topic: 'watering_reminder',
  payload: {
    userId: 'user-1',
    notificationIds: ['notification-1'],
    plantIds: ['plant-1'],
  },
  retryCount: 0,
  createdAt: new Date(),
  scheduledAt: new Date(),
  ...overrides,
})

// Runs processMessage and returns the pushes that were captured. Defaults to
// user-1's fixture tokens + a single queued notification, so existing callers
// stay one-liners. Pass `tokens` to exercise other per-account device sets, and
// `notifications` when you want to inspect the seeded objects after the run —
// the notification mock mutates them in place (e.g. status flips to 'sent').
const runAndCapturePushes = async (
  message: QueueMessage,
  {
    tokens = mockDeviceTokens,
    notifications = [
      createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        status: 'queued',
      }),
    ],
  }: {
    tokens?: DeviceToken[]
    notifications?: Notification[]
  } = {}
): Promise<PushMessage[]> => {
  const sentMessages: PushMessage[] = []
  await Effect.runPromise(
    processMessage(message).pipe(
      Effect.provide(
        Layer.mergeAll(
          MockAlerterLive,
          createMockPushService({
            onSendBatch: (msgs) => sentMessages.push(...msgs),
          }),
          createMockDeviceTokenRepository(tokens),
          createMockNotificationRepository(notifications),
          LaMocksLive,
          LivingPlantsLive
        )
      ),
      Effect.provideService(References.MinimumLogLevel, 'None')
    )
  )
  return sentMessages
}

describe('Notification Worker', () => {
  describe('processMessage', () => {
    it('should send push notifications to active device tokens', async () => {
      const sentMessages: PushMessage[] = []

      const message = createTestQueueMessage()
      const notification = createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        status: 'queued',
      })

      // user-1 has 2 active tokens in mockDeviceTokens
      await Effect.runPromise(
        processMessage(message).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({
                onSendBatch: (msgs) => sentMessages.push(...msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([notification]),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      // user-1 has 2 active tokens
      expect(sentMessages).toHaveLength(2)
      // Each distinct device token receives exactly one push — proves the
      // fan-out addresses every device, not the same one twice.
      expect(new Set(sentMessages.map((m) => m.to))).toEqual(
        new Set(['expo-push-token-123', 'expo-push-token-456'])
      )
      expect(sentMessages[0]?.title).toBe('💧 Your Test Plant is thirsty')
    })

    it('pushes to active devices only and skips inactive ones for one account', async () => {
      const userId = 'mixed-device-user'
      const tokens = [
        createTestDeviceToken({
          userId,
          token: 'active-phone',
          platform: 'ios',
          isActive: true,
        }),
        createTestDeviceToken({
          userId,
          token: 'active-tablet',
          platform: 'ios',
          isActive: true,
        }),
        createTestDeviceToken({
          userId,
          token: 'retired-phone',
          platform: 'android',
          isActive: false,
        }),
      ]

      const sentMessages = await runAndCapturePushes(
        createTestQueueMessage({
          payload: {
            userId,
            notificationIds: ['notification-1'],
            plantIds: [],
          },
        }),
        {
          tokens,
          notifications: [
            createPlantRow({
              id: 'notification-1',
              userId,
              plantId: 'plant-mixed',
              status: 'queued',
            }),
          ],
        }
      )

      // Only the two active devices are pushed; the inactive token is excluded.
      expect(sentMessages).toHaveLength(2)
      const targets = sentMessages.map((m) => m.to)
      expect(new Set(targets)).toEqual(
        new Set(['active-phone', 'active-tablet'])
      )
      expect(targets).not.toContain('retired-phone')
    })

    it('fans out to every active device when an account has more than two', async () => {
      const userId = 'three-device-user'
      const tokens = [
        createTestDeviceToken({ userId, token: 'phone-1', platform: 'ios' }),
        createTestDeviceToken({ userId, token: 'tablet-1', platform: 'ios' }),
        createTestDeviceToken({
          userId,
          token: 'phone-2',
          platform: 'android',
        }),
      ]

      const sentMessages = await runAndCapturePushes(
        createTestQueueMessage({
          payload: {
            userId,
            notificationIds: ['notification-1'],
            plantIds: [],
          },
        }),
        {
          tokens,
          notifications: [
            createPlantRow({
              id: 'notification-1',
              userId,
              plantId: 'plant-three',
              status: 'queued',
            }),
          ],
        }
      )

      // One push per device — fan-out is not capped at two.
      expect(sentMessages).toHaveLength(3)
      expect(new Set(sentMessages.map((m) => m.to))).toEqual(
        new Set(['phone-1', 'tablet-1', 'phone-2'])
      )
    })

    it('should mark notification as sent on success', async () => {
      const notification = createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        status: 'queued',
      })

      await runAndCapturePushes(createTestQueueMessage(), {
        notifications: [notification],
      })

      // The notification mock mutates the seeded object in place, so we can
      // read the post-send state directly off the reference we created.
      expect(notification.status).toBe('sent')
      expect(notification.sentAt).toBeDefined()
    })

    it('should still mark as sent when user has no active tokens', async () => {
      const notification = createPlantRow({
        id: 'notification-1',
        userId: 'user-2',
        plantId: 'plant-user-2',
        status: 'queued',
      })

      // user-2 owns only an inactive token in the fixture, so there is nobody
      // to push to. Default `tokens` (mockDeviceTokens) already include it.
      const sentMessages = await runAndCapturePushes(
        createTestQueueMessage({
          payload: {
            userId: 'user-2',
            notificationIds: ['notification-1'],
            plantIds: [],
          },
        }),
        { notifications: [notification] }
      )

      // No active devices → zero pushes, but the notification is still drained
      // from the pending queue (marked sent) so it isn't retried forever.
      expect(sentMessages).toHaveLength(0)
      expect(notification.status).toBe('sent')
    })

    it('should fail when push service fails', async () => {
      const message = createTestQueueMessage()
      const notification = createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        status: 'queued',
      })

      const result = await Effect.runPromiseExit(
        processMessage(message).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createFailingPushService('Push failed'),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([notification]),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(result._tag).toBe('Failure')
    })

    it('should include topic and metadata in push data', async () => {
      const sentMessages: PushMessage[] = []

      const message = createTestQueueMessage({
        topic: 'delegation_request',
        payload: {
          userId: 'user-1',
          notificationIds: ['notification-1'],
          plantIds: [],
          metadata: { delegationId: 'deleg-42' },
        },
      })
      const notification = createPlantRow({
        id: 'notification-1',
        type: 'delegation_request',
        title: 'Delegation request',
        body: 'Someone wants you to care for their plants',
        userId: 'user-1',
        status: 'queued',
      })

      await Effect.runPromise(
        processMessage(message).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({
                onSendBatch: (msgs) => sentMessages.push(...msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([notification]),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(sentMessages[0]?.data).toBeDefined()
      expect(sentMessages[0]?.data?.topic).toBe('delegation_request')
      expect(sentMessages[0]?.data?.delegationId).toBe('deleg-42')
      expect(sentMessages[0]?.data?.title).toBe('Delegation request')
      expect(sentMessages[0]?.data?.body).toBe(
        'Someone wants you to care for their plants'
      )
    })

    it('should include plantIds as JSON string in push data', async () => {
      const sentMessages: PushMessage[] = []

      const message = createTestQueueMessage({
        topic: 'watering_reminder',
        payload: {
          userId: 'user-1',
          notificationIds: ['notification-1'],
          plantIds: ['plant-1', 'plant-2'],
        },
      })
      const notification = createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        status: 'queued',
      })

      await Effect.runPromise(
        processMessage(message).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({
                onSendBatch: (msgs) => sentMessages.push(...msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([notification]),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(sentMessages[0]?.data?.topic).toBe('watering_reminder')
      expect(sentMessages[0]?.data?.plantIds).toBe('plant-1,plant-2')
    })

    it('should not include plantIds in data when empty', async () => {
      const sentMessages: PushMessage[] = []

      const message = createTestQueueMessage({
        topic: 'new_follower',
        payload: {
          userId: 'user-1',
          notificationIds: ['notification-1'],
          plantIds: [],
          metadata: { senderId: 'user-99' },
        },
      })
      const notification = createPlantRow({
        id: 'notification-1',
        type: 'new_follower',
        plantId: undefined,
        userId: 'user-1',
        status: 'queued',
      })

      await Effect.runPromise(
        processMessage(message).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({
                onSendBatch: (msgs) => sentMessages.push(...msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([notification]),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(sentMessages[0]?.data?.topic).toBe('new_follower')
      expect(sentMessages[0]?.data?.senderId).toBe('user-99')
      expect(sentMessages[0]?.data?.plantIds).toBeUndefined()
    })

    it('should set time-sensitive for every care topic', async () => {
      const careTopics = [
        'watering_reminder',
        'fertilization_reminder',
        'misting_reminder',
        'repotting_reminder',
        'overdue_reminder',
      ] as const

      for (const topic of careTopics) {
        const sentMessages = await runAndCapturePushes(
          createTestQueueMessage({ topic })
        )
        expect(sentMessages.length).toBeGreaterThan(0)
        for (const m of sentMessages) {
          expect(m.interruptionLevel).toBe('time-sensitive')
        }
      }
    })

    it('should not set interruptionLevel for non-care topics', async () => {
      const sentMessages = await runAndCapturePushes(
        createTestQueueMessage({
          topic: 'daily_tip',
          payload: {
            userId: 'user-1',
            notificationIds: ['notification-1'],
            plantIds: [],
          },
        }),
        {
          notifications: [
            createPlantRow({
              id: 'notification-1',
              type: 'daily_tip',
              userId: 'user-1',
              status: 'queued',
            }),
          ],
        }
      )

      expect(sentMessages.length).toBeGreaterThan(0)
      for (const m of sentMessages) {
        expect(m.interruptionLevel).toBeUndefined()
      }
    })

    it('should handle grouped message and mark all IDs as sent', async () => {
      const sentMessages: PushMessage[] = []

      const message = createTestQueueMessage({
        payload: {
          userId: 'user-1',
          notificationIds: ['notif-1', 'notif-2', 'notif-3'],
          plantIds: ['plant-1', 'plant-2', 'plant-3'],
        },
      })

      const notifications = [
        createPlantRow({
          id: 'notif-1',
          userId: 'user-1',
          plantId: 'plant-1',
          status: 'queued',
        }),
        createPlantRow({
          id: 'notif-2',
          userId: 'user-1',
          plantId: 'plant-2',
          status: 'queued',
        }),
        createPlantRow({
          id: 'notif-3',
          userId: 'user-1',
          plantId: 'plant-3',
          status: 'queued',
        }),
      ]

      await Effect.runPromise(
        processMessage(message).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({
                onSendBatch: (msgs) => sentMessages.push(...msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository(notifications),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      // Sends 1 push per device (user-1 has 2 active tokens)
      expect(sentMessages).toHaveLength(2)
      expect(sentMessages[0]?.title).toBe('💧 3 plants are thirsty')
      for (const m of sentMessages) {
        expect(m.interruptionLevel).toBe('time-sensitive')
      }
    })
  })

  describe('render at delivery', () => {
    const recipient = (language: 'en' | 'fr') =>
      createTestUser({
        id: 'user-1',
        language,
        careReminders: true,
        doNotDisturb: false,
        timezone: 'UTC',
      })

    const withParams = (row: Notification, params: unknown): Notification =>
      Object.assign(row, { params })

    const deliver = async (
      message: QueueMessage,
      rows: Notification[],
      {
        language = 'en',
        plants = [createTestPlant({ id: 'plant-1', userId: 'user-1' })],
        devices = mockDeviceTokens,
        warnings = [],
      }: {
        language?: 'en' | 'fr'
        plants?: ReturnType<typeof createTestPlant>[]
        devices?: DeviceToken[]
        warnings?: unknown[]
      } = {}
    ) => {
      const pushes: PushMessage[] = []
      await Effect.runPromise(
        processMessage(message).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              MockSqlClientLive,
              createMockPushService({
                onSendBatch: (msgs) => pushes.push(...msgs),
              }),
              createMockDeviceTokenRepository(devices),
              createMockNotificationRepository(rows),
              createMockActivityPushTokenRepository(),
              createMockCareScheduleRepository(),
              createMockCareLogRepository([]),
              createMockDelegationRepository(),
              createMockCanopyRepository([]),
              createMockUserRepository([recipient(language)]),
              createMockPlantRepository({ plants }),
              Logger.layer([
                Logger.make(({ logLevel, message }) => {
                  if (logLevel === 'Warn') warnings.push(message)
                }),
              ])
            )
          )
        )
      )
      return pushes
    }

    const simpleMessage = (
      topic: NotificationTopic,
      notificationIds: string[]
    ): QueueMessage =>
      createTestQueueMessage({
        topic,
        payload: { userId: 'user-1', notificationIds, plantIds: [] },
      })

    it("pushes a row recorded in English in the recipient's French", async () => {
      const row = withParams(
        createRow({
          id: 'streak-1',
          type: 'streak_at_risk',
          status: 'queued',
          title: "🔥 Don't lose your 12-day streak!",
          body: 'Your Monstera still needs care today. Keep the streak alive!',
        }),
        { streakCount: 12, plantName: 'Monstera' }
      )

      const pushes = await deliver(
        simpleMessage('streak_at_risk', ['streak-1']),
        [row],
        { language: 'fr' }
      )

      const french = {
        title: '🔥 Ne perds pas ta série de 12 jours !',
        body: "Ta Monstera a encore besoin de soins aujourd'hui. Garde le rythme !",
      }
      expect(
        Array.map(pushes, (m) => ({ title: m.title, body: m.body }))
      ).toEqual([french, french])
      expect(Array.map(pushes, (m) => m.data?.title)).toEqual([
        french.title,
        french.title,
      ])
      expect({ status: row.status, title: row.title, body: row.body }).toEqual({
        status: 'sent',
        ...french,
      })
    })

    it('pushes the stored text of a row written before params existed', async () => {
      const row = createRow({
        id: 'legacy-1',
        type: 'streak_at_risk',
        status: 'queued',
        title: 'Stored title',
        body: 'Stored body',
      })

      const warnings: unknown[] = []

      const pushes = await deliver(
        simpleMessage('streak_at_risk', ['legacy-1']),
        [row],
        { language: 'fr', warnings }
      )

      expect(Array.map(pushes, (m) => [m.title, m.body])).toEqual([
        ['Stored title', 'Stored body'],
        ['Stored title', 'Stored body'],
      ])
      expect([row.status, row.title]).toEqual(['sent', 'Stored title'])
      expect(warnings).toEqual([])
    })

    it('names the plant by its name at delivery, not at recording', async () => {
      const row = withParams(
        createRow({
          id: 'photo-1',
          type: 'photo_reminder',
          status: 'queued',
          plantId: 'plant-1',
        }),
        { plantName: 'Fern', daysSincePhoto: 30 }
      )

      const pushes = await deliver(
        simpleMessage('photo_reminder', ['photo-1']),
        [row],
        {
          plants: [
            createTestPlant({
              id: 'plant-1',
              userId: 'user-1',
              name: 'Ferdinand',
            }),
          ],
        }
      )

      expect(pushes[0]?.body).toBe(
        "Your Ferdinand hasn't had a photo in 30 days. Capture how far it's come!"
      )
    })

    it('pushes the stored text of a row whose params do not render', async () => {
      const row = withParams(
        createRow({
          id: 'trial-1',
          type: 'trial_ending',
          status: 'queued',
          plantId: undefined,
          title: 'Stored trial title',
          body: 'Stored trial body',
        }),
        { trialDaysLeft: 'three' }
      )
      const rows = [row]
      const warnings: unknown[] = []

      const pushes = await deliver(
        simpleMessage('trial_ending', ['trial-1']),
        rows,
        { language: 'fr', warnings }
      )

      expect(Array.map(pushes, (m) => [m.title, m.body])).toEqual([
        ['Stored trial title', 'Stored trial body'],
        ['Stored trial title', 'Stored trial body'],
      ])
      expect(Array.map(rows, (r) => [r.id, r.status, r.title, r.body])).toEqual(
        [['trial-1', 'sent', 'Stored trial title', 'Stored trial body']]
      )
      expect(warnings).toEqual([
        [
          'Sending stored text - params did not render',
          { notificationId: 'trial-1', messageId: expect.any(String) },
        ],
      ])
    })

    it('sends a malformed row its stored text beside a well-formed one', async () => {
      const tip = (id: string, params: unknown) =>
        withParams(
          createRow({
            id,
            type: 'daily_tip',
            status: 'queued',
            plantId: undefined,
            title: `Stored ${id}`,
            body: `Stored ${id} body`,
          }),
          params
        )
      const rows = [
        tip('tip-good', { tipTitle: 'Mist ferns', tipBody: 'Weekly' }),
        tip('tip-bad', { tipTitle: 5 }),
      ]

      const pushes = await deliver(
        simpleMessage('daily_tip', ['tip-good', 'tip-bad']),
        rows
      )

      expect(pushes[0]?.title).toBe('Mist ferns')
      expect(Array.map(rows, (r) => [r.id, r.status, r.title])).toEqual([
        ['tip-good', 'sent', 'Mist ferns'],
        ['tip-bad', 'sent', 'Stored tip-bad'],
      ])
    })

    it('pushes the first row of the message when the gate returns rows out of order', async () => {
      const tip = (id: string, tipTitle: string) =>
        withParams(
          createRow({
            id,
            type: 'daily_tip',
            status: 'queued',
            plantId: undefined,
          }),
          { tipTitle, tipBody: `${tipTitle} body` }
        )
      const rows = [tip('tip-b', 'Second'), tip('tip-a', 'First')]

      const pushes = await deliver(
        simpleMessage('daily_tip', ['tip-a', 'tip-b']),
        rows
      )

      expect(pushes[0]?.title).toBe('First')
    })

    it('stores the rendered text on a row whose recipient has no device', async () => {
      const row = withParams(
        createRow({
          id: 'trial-1',
          type: 'trial_ending',
          status: 'queued',
          plantId: undefined,
        }),
        { trialDaysLeft: 3 }
      )

      const pushes = await deliver(
        simpleMessage('trial_ending', ['trial-1']),
        [row],
        { language: 'fr', devices: [] }
      )

      const french = buildSimpleContent(
        'trial_ending',
        { trialDaysLeft: 3 },
        'fr'
      )
      expect(pushes).toEqual([])
      expect([row.status, row.title, row.body]).toEqual([
        'sent',
        french.title,
        french.body,
      ])
    })

    it('deletes a care row that has no plant to name instead of leaving it queued', async () => {
      const rows = [
        createRow({
          id: 'water-orphan',
          type: 'watering_reminder',
          status: 'queued',
          plantId: undefined,
        }),
      ]

      const pushes = await deliver(
        createTestQueueMessage({
          payload: {
            userId: 'user-1',
            notificationIds: ['water-orphan'],
            plantIds: [],
          },
        }),
        rows,
        { plants: [] }
      )

      expect(pushes).toEqual([])
      expect(rows).toEqual([])
    })

    it('groups anniversaries under the plants current names and keeps each row its own text', async () => {
      const anniversary = (id: string, plantId: string, plantName: string) =>
        withParams(
          createRow({
            id,
            type: 'plant_anniversary',
            status: 'queued',
            plantId,
          }),
          { plantName, anniversaryDuration: '1 year', dateAdded: 'Apr 3, 2025' }
        )
      const rows = [
        anniversary('anniv-1', 'plant-1', 'Monstera'),
        anniversary('anniv-2', 'plant-2', 'Pothos'),
      ]

      const pushes = await deliver(
        simpleMessage('plant_anniversary', ['anniv-1', 'anniv-2']),
        rows,
        {
          language: 'fr',
          plants: [
            createTestPlant({ id: 'plant-1', userId: 'user-1', name: 'Mona' }),
            createTestPlant({ id: 'plant-2', userId: 'user-1', name: 'Poe' }),
          ],
        }
      )

      const grouped = buildGroupedPlantAnniversaryContent(['Mona', 'Poe'], 'fr')
      expect(pushes[0]?.title).toBe(grouped.title)
      expect(pushes[0]?.body).toBe(grouped.body)
      const own = (plantName: string) =>
        buildSimpleContent(
          'plant_anniversary',
          {
            plantName,
            anniversaryDuration: '1 year',
            dateAdded: 'Apr 3, 2025',
          },
          'fr'
        )
      expect(
        Array.map(rows, (row) => [row.status, row.title, row.body])
      ).toEqual([
        ['sent', own('Mona').title, own('Mona').body],
        ['sent', own('Poe').title, own('Poe').body],
      ])
    })

    it('writes the digest a care push carried onto every row it names', async () => {
      const care = (id: string, type: NotificationTopic) =>
        createRow({ id, type, status: 'queued', plantId: 'plant-1' })
      const rows = [
        care('water-1', 'watering_reminder'),
        care('mist-1', 'misting_reminder'),
      ]

      const pushes = await deliver(
        createTestQueueMessage({
          payload: {
            userId: 'user-1',
            notificationIds: ['water-1', 'mist-1'],
            plantIds: ['plant-1'],
          },
        }),
        rows,
        {
          language: 'fr',
          plants: [
            createTestPlant({
              id: 'plant-1',
              userId: 'user-1',
              name: 'Monstera',
            }),
          ],
        }
      )

      const digest = buildCareDigestContent(
        [
          {
            plantName: 'Monstera',
            careTypes: ['watering_reminder', 'misting_reminder'],
          },
        ],
        'fr'
      )
      expect(pushes[0]?.title).toBe(digest.title)
      expect(
        Array.map(rows, (row) => [row.status, row.title, row.body])
      ).toEqual([
        ['sent', digest.title, digest.body],
        ['sent', digest.title, digest.body],
      ])
    })
  })

  describe('retry through Postgres', () => {
    const minutesAfterEpoch = (n: number) =>
      new Date(Duration.toMillis(Duration.minutes(n)))

    const deliveryRig = (
      rows: Notification[],
      {
        devices = mockDeviceTokens,
        ...options
      }: {
        deliveryClaims?: Record<string, string>
        devices?: DeviceToken[]
      } = {}
    ) => {
      const sends: PushMessage[][] = []
      const requeued: QueueMessage[] = []
      const acked: string[] = []
      const inbox: QueueMessage[] = []
      const push: MockPushServiceOptions = {
        shouldFail: true,
        onSendBatch: (msgs: PushMessage[]) => sends.push(msgs),
      }
      const alerter = createMockAlerter()
      const deadLetters = createMockDeadLetterRepositoryWithCapture()
      const notificationRepo = createMockNotificationRepository(rows, options)
      const layer = Layer.mergeAll(
        alerter.layer,
        createMockPushService(push),
        createMockDeviceTokenRepository(devices),
        notificationRepo,
        createMockMessageQueue({
          onDequeue: () => {
            const msg = inbox.shift()
            return msg ? { message: msg, rawData: JSON.stringify(msg) } : null
          },
          onEnqueue: (_, message) => requeued.push(message),
          onAck: (rawData) => acked.push(rawData),
        }),
        deadLetters.layer,
        LaMocksLive,
        LivingPlantsLive
      )
      const underTestClock = <A, E>(
        effect: Effect.Effect<A, E, Layer.Success<typeof layer>>
      ) =>
        Effect.runPromiseExit(
          Effect.gen(function* () {
            const fiber = yield* Effect.forkChild(
              effect.pipe(Effect.provide(layer))
            )
            yield* Effect.forEach(Array.range(1, 30), () =>
              TestClock.adjust('1 second')
            )
            return yield* Fiber.join(fiber)
          }).pipe(
            Effect.scoped,
            Effect.provide(TestClock.layer()),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
      const relay = Effect.gen(function* () {
        const repo = yield* NotificationRepository
        const due = yield* repo.claimPendingToSchedule(100)
        return createTestQueueMessage({
          payload: {
            userId: 'user-1',
            notificationIds: Array.map(due, (row) => row.id),
            plantIds: ['plant-1'],
          },
        })
      })
      const attempt = async (message?: QueueMessage) => {
        const relayed = await underTestClock(relay)
        if (Exit.isFailure(relayed)) throw new Error('relay failed')
        inbox.push(message ?? relayed.value)
        return underTestClock(consumeNext)
      }
      return {
        sends,
        requeued,
        acked,
        push,
        alerts: alerter.events,
        deadLetters: deadLetters.capturedMessages,
        attempt,
      }
    }

    const pendingRow = (id: string) =>
      createPlantRow({
        id,
        userId: 'user-1',
        status: 'pending',
        scheduledAt: new Date(0),
      })

    it('sends once per dequeue and puts the rows back one minute out', async () => {
      const row = pendingRow('notification-1')
      const rig = deliveryRig([row])

      await rig.attempt()

      expect(rig.sends).toHaveLength(1)
      expect(rig.acked).toHaveLength(1)
      expect(rig.requeued).toEqual([])
      expect(row).toMatchObject({
        status: 'pending',
        retryCount: 1,
        scheduledAt: minutesAfterEpoch(1),
      })
      expect(rig.deadLetters).toEqual([])
      expect(rig.alerts).toEqual([])
    })

    it('backs off five minutes after the second failure', async () => {
      const row = pendingRow('notification-1')
      const rig = deliveryRig([row])

      await rig.attempt()
      await rig.attempt()

      expect(rig.sends).toHaveLength(2)
      expect(row).toMatchObject({
        status: 'pending',
        retryCount: 2,
        scheduledAt: minutesAfterEpoch(5),
      })
      expect(rig.deadLetters).toEqual([])
    })

    it('fails the rows at the third failure with one dead letter and one alert', async () => {
      const row = pendingRow('notification-1')
      const rig = deliveryRig([row])

      const third = createTestQueueMessage({ id: 'msg-third' })

      await rig.attempt()
      await rig.attempt()
      await rig.attempt(third)
      await rig.attempt()

      expect(rig.sends).toHaveLength(3)
      expect(row).toMatchObject({ status: 'failed', retryCount: 3 })
      expect(rig.deadLetters).toEqual([
        expect.objectContaining({
          originalMessageId: 'msg-third',
          topic: 'watering_reminder',
          error: expect.stringContaining('Mock push batch failure'),
          retryCount: 3,
          userId: 'user-1',
          plantId: 'plant-1',
        }),
      ])
      expect(rig.alerts).toEqual([
        expect.objectContaining({
          _tag: 'warning',
          summary: 'Message moved to dead letter queue',
        }),
      ])
      expect(rig.requeued).toEqual([])
    })

    it('counts two failures on a row that then goes out', async () => {
      const row = pendingRow('notification-1')
      const rig = deliveryRig([row])

      await rig.attempt()
      await rig.attempt()
      rig.push.shouldFail = false
      await rig.attempt()

      expect(rig.sends).toHaveLength(3)
      expect(row).toMatchObject({ status: 'sent', retryCount: 2 })
      expect(rig.deadLetters).toEqual([])
    })

    it('leaves a row another message holds untouched', async () => {
      const mine = createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        plantId: 'plant-1',
        status: 'queued',
        retryCount: 2,
      })
      const held = createPlantRow({
        id: 'notification-2',
        userId: 'user-1',
        plantId: 'plant-2',
        status: 'queued',
        retryCount: 2,
      })
      const rig = deliveryRig([mine, held], {
        deliveryClaims: { 'notification-2': 'msg-other' },
      })

      await rig.attempt(
        createTestQueueMessage({
          payload: {
            userId: 'user-1',
            notificationIds: ['notification-1', 'notification-2'],
            plantIds: ['plant-1', 'plant-2'],
          },
        })
      )

      expect(mine).toMatchObject({ status: 'failed', retryCount: 3 })
      expect(held).toMatchObject({ status: 'queued', retryCount: 2 })
      expect(rig.deadLetters).toHaveLength(1)
    })

    it('writes one dead letter and one alert when several rows of a message fail together', async () => {
      const rows = [pendingRow('notification-1'), pendingRow('notification-2')]
      const rig = deliveryRig(rows)

      await rig.attempt()
      await rig.attempt()
      await rig.attempt()

      expect(rig.sends).toHaveLength(3)
      expect(rows.map((row) => row.status)).toEqual(['failed', 'failed'])
      expect(rig.deadLetters).toHaveLength(1)
      expect(rig.alerts).toEqual([
        expect.objectContaining({
          context: expect.objectContaining({
            notificationIds: ['notification-1', 'notification-2'],
          }),
        }),
      ])
    })

    it('dead-letters and alerts only the rows that failed when the rest of the message retries', async () => {
      const spent = createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        plantId: 'plant-1',
        status: 'queued',
        retryCount: 2,
      })
      const fresh = createPlantRow({
        id: 'notification-2',
        userId: 'user-1',
        plantId: 'plant-2',
        status: 'queued',
        retryCount: 0,
      })
      const rig = deliveryRig([spent, fresh])

      await rig.attempt(
        createTestQueueMessage({
          payload: {
            userId: 'user-1',
            notificationIds: ['notification-1', 'notification-2'],
            plantIds: ['plant-1', 'plant-2'],
          },
        })
      )

      expect(spent).toMatchObject({ status: 'failed', retryCount: 3 })
      expect(fresh).toMatchObject({ status: 'pending', retryCount: 1 })
      expect(rig.deadLetters).toEqual([
        expect.objectContaining({ retryCount: 3 }),
      ])
      expect(rig.alerts).toEqual([
        expect.objectContaining({
          context: expect.objectContaining({
            notificationIds: ['notification-1'],
          }),
        }),
      ])
    })

    it('records the highest retry count among the failed rows on the dead letter', async () => {
      const rows = [
        createPlantRow({
          id: 'notification-1',
          userId: 'user-1',
          status: 'queued',
          retryCount: 2,
        }),
        createPlantRow({
          id: 'notification-2',
          userId: 'user-1',
          status: 'queued',
          retryCount: 4,
        }),
      ]
      const rig = deliveryRig(rows)

      await rig.attempt(
        createTestQueueMessage({
          payload: {
            userId: 'user-1',
            notificationIds: ['notification-1', 'notification-2'],
            plantIds: ['plant-1'],
          },
        })
      )

      expect(rows.map((row) => row.retryCount)).toEqual([3, 5])
      expect(rig.deadLetters).toEqual([
        expect.objectContaining({ retryCount: 5 }),
      ])
    })

    it('puts the rows back one minute out when a read fails before the send', async () => {
      const row = createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        status: 'queued',
      })
      const message = createTestQueueMessage()
      const dbDown = new SqlError({
        reason: new UnknownError({ cause: 'db down', message: 'db down' }),
      })
      const readFails = Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          findByIds: () => Effect.fail(dbDown),
        }))
      ).pipe(Layer.provide(createMockNotificationRepository([row])))
      const acked: string[] = []
      const sends: PushMessage[][] = []

      const exit = await Effect.runPromiseExit(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({
                onSendBatch: (msgs) => sends.push(msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              readFails,
              createMockMessageQueue({
                onDequeue: () => ({
                  message,
                  rawData: JSON.stringify(message),
                }),
                onAck: (rawData) => acked.push(rawData),
              }),
              createMockDeadLetterRepository(),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(sends).toEqual([])
      expect(acked).toHaveLength(1)
      expect(row).toMatchObject({ status: 'pending', retryCount: 1 })
    })

    describe('provider tickets', () => {
      const ok = (): PushTicket => ({ id: crypto.randomUUID(), status: 'ok' })
      const rejected = (code: PushTicketErrorCode): PushTicket => ({
        id: crypto.randomUUID(),
        status: 'error',
        code,
      })
      const ticketRig = (
        row: Notification,
        tickets: (msgs: PushMessage[]) => PushTicket[],
        devices?: DeviceToken[]
      ) => {
        const rig = deliveryRig([row], devices ? { devices } : {})
        rig.push.shouldFail = false
        rig.push.batchTickets = tickets
        return rig
      }

      it('retries a message whose every ticket is an error and records the ticket codes', async () => {
        const row = pendingRow('notification-1')
        const rig = ticketRig(row, (msgs) =>
          Array.map(msgs, () => rejected('InvalidCredentials'))
        )

        await rig.attempt()

        expect(rig.sends).toHaveLength(1)
        expect(rig.sends[0]).toHaveLength(2)
        expect(row).toMatchObject({
          status: 'pending',
          retryCount: 1,
          scheduledAt: minutesAfterEpoch(1),
          lastError:
            'PushSendError: Every push ticket failed: InvalidCredentials (2)',
        })
        expect(rig.acked).toHaveLength(1)
        expect(rig.alerts).toEqual([])
      })

      it('names every failing code with its count', async () => {
        const row = pendingRow('notification-1')
        const codes: PushTicketErrorCode[] = [
          'MalformedToken',
          'DeviceNotRegistered',
          'DeviceNotRegistered',
        ]
        const rig = ticketRig(
          row,
          (msgs) => Array.map(msgs, (_, i) => rejected(codes[i] ?? 'Unknown')),
          Array.map(codes, () => createTestDeviceToken({ userId: 'user-1' }))
        )

        await rig.attempt()

        expect(row.lastError).toBe(
          'PushSendError: Every push ticket failed: MalformedToken (1); DeviceNotRegistered (2)'
        )
      })

      it('retries a message whose every ticket has no Expo code', async () => {
        const row = pendingRow('notification-1')
        const rig = ticketRig(row, (msgs) =>
          Array.map(msgs, () => rejected('Unknown'))
        )

        await rig.attempt()

        expect(row).toMatchObject({
          status: 'pending',
          retryCount: 1,
          lastError: 'PushSendError: Every push ticket failed: Unknown (2)',
        })
      })

      it('keeps a message sent when only a later ticket is ok', async () => {
        const row = pendingRow('notification-1')
        const rig = ticketRig(row, (msgs) =>
          Array.map(msgs, (_, i) =>
            i === 0 ? rejected('DeviceNotRegistered') : ok()
          )
        )

        await rig.attempt()

        expect(row).toMatchObject({ status: 'sent', retryCount: 0 })
      })

      it('retries a device that is no longer registered once, then marks the message sent', async () => {
        const row = pendingRow('notification-1')
        const device = createTestDeviceToken({ userId: 'user-1' })
        const rig = ticketRig(
          row,
          (msgs) => {
            Object.assign(device, { isActive: false })
            return Array.map(msgs, () => rejected('DeviceNotRegistered'))
          },
          [device]
        )

        await rig.attempt()

        expect(row).toMatchObject({
          status: 'pending',
          retryCount: 1,
          lastError:
            'PushSendError: Every push ticket failed: DeviceNotRegistered (1)',
        })

        await rig.attempt()

        expect(rig.sends).toHaveLength(1)
        expect(row).toMatchObject({ status: 'sent', retryCount: 1 })
        expect(rig.deadLetters).toEqual([])
      })

      it('keeps a partial success sent', async () => {
        const row = pendingRow('notification-1')
        const rig = ticketRig(row, (msgs) =>
          Array.map(msgs, (_, i) =>
            i === 0 ? ok() : rejected('DeviceNotRegistered')
          )
        )

        await rig.attempt()

        expect(row).toMatchObject({ status: 'sent', retryCount: 0 })
        expect(rig.deadLetters).toEqual([])
        expect(rig.alerts).toEqual([
          expect.objectContaining({
            _tag: 'warning',
            summary: 'Some push notifications failed',
            context: { total: 2, failed: 1 },
          }),
        ])
      })

      it('marks a message sent when every ticket is ok', async () => {
        const row = pendingRow('notification-1')
        const rig = ticketRig(row, (msgs) => Array.map(msgs, ok))

        await rig.attempt()

        expect(row).toMatchObject({ status: 'sent', retryCount: 0 })
        expect(rig.alerts).toEqual([])
      })

      it('marks a message sent when the provider returns no ticket', async () => {
        const row = pendingRow('notification-1')
        const rig = ticketRig(row, () => [])

        await rig.attempt()

        expect(row).toMatchObject({ status: 'sent', retryCount: 0 })
      })

      it('dead-letters a message whose tickets all fail three times', async () => {
        const row = pendingRow('notification-1')
        const rig = ticketRig(row, (msgs) =>
          Array.map(msgs, () => rejected('MessageRateExceeded'))
        )

        await rig.attempt()
        await rig.attempt()
        await rig.attempt()

        expect(rig.sends).toHaveLength(3)
        expect(row).toMatchObject({ status: 'failed', retryCount: 3 })
        expect(rig.deadLetters).toHaveLength(1)
        expect(rig.deadLetters[0]?.error).toContain('MessageRateExceeded')
      })
    })

    it('leaves the message unacked when the retry write fails', async () => {
      const row = createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        status: 'queued',
      })
      const message = createTestQueueMessage()
      const dbDown = new SqlError({
        reason: new UnknownError({ cause: 'db down', message: 'db down' }),
      })
      const retryWriteFails = Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          retryLater: () => Effect.fail(dbDown),
        }))
      ).pipe(Layer.provide(createMockNotificationRepository([row])))
      const acked: string[] = []
      const sends: PushMessage[][] = []

      const exit = await Effect.runPromiseExit(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({
                shouldFail: true,
                onSendBatch: (msgs) => sends.push(msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              retryWriteFails,
              createMockMessageQueue({
                onDequeue: () => ({
                  message,
                  rawData: JSON.stringify(message),
                }),
                onAck: (rawData) => acked.push(rawData),
              }),
              createMockDeadLetterRepository(),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(sends).toHaveLength(1)
      expect(acked).toEqual([])
      expect(row.status).toBe('queued')
    })
  })

  describe('consumeNext', () => {
    it('should process message from queue', async () => {
      const sentMessages: PushMessage[] = []
      const ackedMessages: string[] = []

      const queueMessage = createTestQueueMessage({
        id: 'msg-to-process',
      })
      const notification = createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        status: 'queued',
      })

      // Use a mutable array for the queue
      const queueMessages: QueueMessage[] = [queueMessage]

      await Effect.runPromise(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockMessageQueue({
                onDequeue: () => {
                  const msg = pipe(
                    Option.fromNullishOr(queueMessages.shift()),
                    Option.getOrNull
                  )
                  if (!msg) return null
                  return { message: msg, rawData: JSON.stringify(msg) }
                },
                onAck: (rawData) => ackedMessages.push(rawData),
              }),
              createMockPushService({
                onSendBatch: (msgs) => sentMessages.push(...msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([notification]),
              createMockDeadLetterRepository(),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(sentMessages.length).toBeGreaterThan(0)
      expect(ackedMessages).toHaveLength(1)
      expect(ackedMessages[0]).toContain('msg-to-process')
    })

    it('should do nothing when queue is empty', async () => {
      const sentMessages: PushMessage[] = []

      await Effect.runPromise(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockMessageQueue(), // Empty queue
              createSuccessPushService(),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([]),
              createMockDeadLetterRepository(),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(sentMessages).toHaveLength(0)
    })

    it('dead-letters and acks an undecodable entry without an id as unknown so the loop moves on', async () => {
      const { layer: dlqLayer, capturedMessages } =
        createMockDeadLetterRepositoryWithCapture()
      const { queue, acked } = createInMemoryRedisQueue(['not json'])

      const handled = await Effect.runPromise(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              Layer.succeed(MessageQueue, queue),
              createSuccessPushService(),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([]),
              dlqLayer,
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(handled).toBe(true)
      expect(acked).toEqual(['not json'])
      expect(capturedMessages).toEqual([
        expect.objectContaining({
          originalMessageId: 'unknown',
          topic: 'unknown',
          payload: 'not json',
          retryCount: 0,
        }),
      ])
    })

    it.each([
      ['a JSON null', 'null', 'null'],
      ['a JSON number', '5', '5'],
      [
        'an object holding an escaped NUL',
        '{"id":"msg-nul","note":"a\\u0000b"}',
        '{"id":"msg-nul","note":"a\\u0000b"}',
      ],
      ['text holding a NUL character', 'not json \u0000', 'not json \\u0000'],
      [
        'an object holding an unpaired surrogate',
        '{"id":"m-sur","x":"\\ud800"}',
        '{"id":"m-sur","x":"\\ud800"}',
      ],
      [
        'arrays nested 2000 deep',
        `${'['.repeat(2000)}${']'.repeat(2000)}`,
        `${'['.repeat(2000)}${']'.repeat(2000)}`,
      ],
    ])(
      'dead-letters %s as its raw text, acks it and alerts once',
      async (_, raw, storedPayload) => {
        const { layer: dlqLayer, capturedMessages } =
          createMockDeadLetterRepositoryWithCapture()
        const { queue, acked } = createInMemoryRedisQueue([raw])
        const alerter = createMockAlerter()

        await Effect.runPromise(
          consumeNext.pipe(
            Effect.provide(
              Layer.mergeAll(
                alerter.layer,
                Layer.succeed(MessageQueue, queue),
                createSuccessPushService(),
                createMockDeviceTokenRepository(mockDeviceTokens),
                createMockNotificationRepository([]),
                dlqLayer,
                LaMocksLive,
                LivingPlantsLive
              )
            ),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )

        expect(acked).toEqual([raw])
        expect(alerter.events).toHaveLength(1)
        expect(Array.map(capturedMessages, (m) => m.payload)).toEqual([
          storedPayload,
        ])
      }
    )

    it('dead-letters an undecodable object entry as the parsed object', async () => {
      const { layer: dlqLayer, capturedMessages } =
        createMockDeadLetterRepositoryWithCapture()
      const raw = JSON.stringify({ id: 'msg-1', topic: 'bogus_topic' })
      const { queue } = createInMemoryRedisQueue([raw])

      await Effect.runPromise(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              Layer.succeed(MessageQueue, queue),
              createSuccessPushService(),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([]),
              dlqLayer,
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(Array.map(capturedMessages, (m) => m.payload)).toEqual([
        { id: 'msg-1', topic: 'bogus_topic' },
      ])
    })

    const dbDown = () =>
      new SqlError({
        reason: new UnknownError({ cause: 'db down', message: 'db down' }),
      })

    const entryWithIds = (id: string, notificationIds: ReadonlyArray<string>) =>
      JSON.stringify({
        id,
        topic: 'new_follower',
        payload: {
          userId: 'user-1',
          notificationIds,
          plantIds: [],
        },
        retryCount: 0,
        createdAt: '2026-11-03T10:00:00.000Z',
        scheduledAt: '2026-11-03T10:00:00.000Z',
      })

    // Claims every id it is given. Like Postgres, it rejects a statement with
    // more than 65535 parameters, and each statement binds 3 besides the ids.
    const bindLimitedRepo = () => {
      const claimed: Array<number> = []
      const marked: Array<number> = []
      const overLimit = (chunk: ReadonlyArray<string>) =>
        chunk.length + 3 > 65_535
      const layer = Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          claimForDelivery: (chunk: ReadonlyArray<string>) => {
            if (overLimit(chunk)) return Effect.fail(dbDown())
            claimed.push(chunk.length)
            return Effect.succeed(chunk)
          },
          markManyAsFailed: (chunk: readonly string[]) => {
            if (overLimit(chunk)) return Effect.fail(dbDown())
            marked.push(chunk.length)
            return Effect.void
          },
        }))
      ).pipe(Layer.provide(createMockNotificationRepository([])))
      return { layer, claimed, marked }
    }

    const total = (counts: ReadonlyArray<number>) =>
      Array.reduce(counts, 0, (sum, n) => sum + n)

    const consumeWithRepo = async (
      raw: string,
      repo: Layer.Layer<NotificationRepository>
    ) => {
      const { layer: dlqLayer, capturedMessages } =
        createMockDeadLetterRepositoryWithCapture()
      const { queue, acked } = createInMemoryRedisQueue([raw])
      const alerter = createMockAlerter()
      await Effect.runPromise(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              alerter.layer,
              Layer.succeed(MessageQueue, queue),
              createSuccessPushService(),
              createMockDeviceTokenRepository(mockDeviceTokens),
              repo,
              dlqLayer,
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )
      return { acked, alerts: alerter.events, capturedMessages }
    }

    it(`dead-letters, acks and alerts once an entry with more than ${MAX_NOTIFICATION_IDS} ids`, async () => {
      const ids = Array.makeBy(MAX_NOTIFICATION_IDS + 1, () =>
        crypto.randomUUID()
      )
      const atCap = entryWithIds('msg-cap', ids.slice(1))
      expect(
        Exit.isSuccess(
          await Effect.runPromiseExit(decodeQueueEntry(atCap, atCap))
        )
      ).toBe(true)
      const raw = entryWithIds('msg-over', ids)
      const repo = bindLimitedRepo()

      const { acked, alerts, capturedMessages } = await consumeWithRepo(
        raw,
        repo.layer
      )

      expect(acked).toEqual([raw])
      expect(alerts).toHaveLength(1)
      expect(Array.map(capturedMessages, (m) => m.originalMessageId)).toEqual([
        'msg-over',
      ])
      expect(total(repo.marked)).toBe(MAX_NOTIFICATION_IDS + 1)
    })

    it('claims and fails an entry with more ids than Postgres can bind in chunks it can bind', async () => {
      const ids = Array.makeBy(70_000, () => crypto.randomUUID())
      const raw = entryWithIds('msg-big', ids)
      const repo = bindLimitedRepo()

      const { acked, alerts, capturedMessages } = await consumeWithRepo(
        raw,
        repo.layer
      )

      expect(acked).toEqual([raw])
      expect(alerts).toHaveLength(1)
      expect(Array.map(capturedMessages, (m) => m.originalMessageId)).toEqual([
        'msg-big',
      ])
      expect(total(repo.claimed)).toBe(70_000)
      expect(total(repo.marked)).toBe(70_000)
    })

    it('leaves an undecodable entry unacked when no dead letter can be written', async () => {
      const failingDeadLetters = Layer.succeed(DeadLetterRepository, {
        create: () => Effect.fail(dbDown()),
      })
      const { queue, acked } = createInMemoryRedisQueue(['not json'])
      const alerter = createMockAlerter()

      const exit = await Effect.runPromiseExit(
        consumeNext.pipe(
          Effect.provide(
            Layer.mergeAll(
              alerter.layer,
              Layer.succeed(MessageQueue, queue),
              createSuccessPushService(),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([]),
              failingDeadLetters,
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(acked).toEqual([])
      expect(alerter.events).toEqual([])
    })
  })

  const activeDelegation = (
    ownerId: string,
    caretakerId: string
  ): DelegationRow => ({
    id: 'delegation-1',
    ownerId,
    caretakerId,
    status: 'active',
    message: null,
    startDate: new Date(Date.now() - 86_400_000),
    endDate: new Date(Date.now() + 86_400_000),
    respondedAt: null,
    canceledAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // Delivers one care push per run, each with its own queued row, through
  // consumeNext. Every run must deliver the regular push: consumeNext acks
  // even after retryLater or the poison path, so the ack alone proves nothing.
  const runWithDeviceTokens = async ({
    tokens,
    runs = 1,
    failLiveActivity,
    delegated = false,
  }: {
    tokens: ActivityPushToken[]
    runs?: number
    failLiveActivity?: MockPushServiceOptions['failLiveActivity']
    // plant-1 belongs to user-2 and is delegated to user-1, who also has a
    // due plant of their own.
    delegated?: boolean
  }) => {
    const laMessages: LiveActivityPushMessage[] = []
    const logs: unknown[] = []
    const retried: string[] = []
    const plants = delegated
      ? [
          createTestPlant({ id: 'plant-1', userId: 'user-2' }),
          createTestPlant({ id: 'plant-2', userId: 'user-1' }),
        ]
      : [createTestPlant({ id: 'plant-1', userId: 'user-1' })]
    const notifications = Array.makeBy(runs, (i) =>
      createPlantRow({
        id: `notification-${i}`,
        userId: 'user-1',
        plantId: 'plant-1',
        status: 'queued',
      })
    )
    const deadLetters = createMockDeadLetterRepositoryWithCapture()
    const activityRepo = createMockActivityPushTokenRepository({ tokens })
    const capture = Logger.make(({ message, fiber }) => {
      logs.push({
        message,
        annotations: fiber.getRef(References.CurrentLogAnnotations),
      })
    })
    const layer = Layer.mergeAll(
      MockAlerterLive,
      createMockPushService({
        onSendLiveActivity: (m) => laMessages.push(m),
        ...(failLiveActivity ? { failLiveActivity } : {}),
      }),
      createMockDeviceTokenRepository(mockDeviceTokens),
      createMockNotificationRepository(notifications, {
        onRetryLater: (ids) => retried.push(...ids),
      }),
      activityRepo,
      createMockCareScheduleRepository({
        plants,
        schedules: Array.map(plants, (p) =>
          createTestSchedule({
            plantId: p.id,
            careType: 'watering',
            nextCareAt: new Date(Date.now() - 60_000),
          })
        ),
      }),
      createMockCareLogRepository([]),
      createMockUserRepository([
        createTestUser({ id: 'user-1', timezone: 'UTC' }),
        createTestUser({ id: 'user-2', timezone: 'UTC' }),
      ]),
      createMockPlantRepository({ plants }),
      createMockCanopyRepository(),
      delegated
        ? createMockDelegationRepository({
            delegations: [activeDelegation('user-2', 'user-1')],
            delegationPlants: [
              { delegationId: 'delegation-1', plantId: 'plant-1' },
            ],
          })
        : createMockDelegationRepository(),
      deadLetters.layer,
      MockSqlClientLive,
      Logger.layer([capture])
    )
    const acked: string[] = []
    for (let i = 0; i < runs; i++) {
      const inbox = [
        createTestQueueMessage({
          id: `msg-${i}`,
          payload: {
            userId: 'user-1',
            notificationIds: [`notification-${i}`],
            plantIds: ['plant-1'],
          },
        }),
      ]
      await Effect.runPromise(
        consumeNext.pipe(
          Effect.provide(
            Layer.merge(
              layer,
              createMockMessageQueue({
                onDequeue: () => {
                  const msg = inbox.shift()
                  return msg
                    ? { message: msg, rawData: JSON.stringify(msg) }
                    : null
                },
                onAck: (rawData) => acked.push(rawData),
              })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'All')
        )
      )
    }
    expect(acked).toHaveLength(runs)
    expect(Array.map(notifications, (n) => n.status)).toEqual(
      Array.makeBy(runs, () => 'sent')
    )
    expect(retried).toEqual([])
    expect(deadLetters.capturedMessages).toEqual([])
    const stillActive = await Effect.runPromise(
      Effect.flatMap(ActivityPushTokenRepository, (repo) =>
        repo.findActiveActivitiesByUserId('user-1')
      ).pipe(Effect.provide(activityRepo))
    )
    return {
      laMessages,
      logs,
      stillActive: Array.map(stillActive, (a) => a.token).sort(),
    }
  }

  describe('Live Activity start guard', () => {
    const startToken = (
      overrides: Partial<ActivityPushToken> = {}
    ): ActivityPushToken => ({
      id: 'apt-1',
      userId: 'user-1',
      deviceTokenId: 'token-1',
      kind: 'start',
      activityId: null,
      token: 'start-token-1',
      status: 'active',
      startedAt: new Date(),
      endsAt: null,
      lastConfirmedAt: null,
      lastFailedAt: null,
      lastStartSentAt: null,
      updatedAt: new Date(),
      ...overrides,
    })

    const runWithStartToken = async (token: ActivityPushToken, runs: number) =>
      (await runWithDeviceTokens({ tokens: [token], runs })).laMessages

    it('starts exactly one activity when the same user is processed twice', async () => {
      const laMessages = await runWithStartToken(startToken(), 2)
      const starts = laMessages.filter((m) => m._tag === 'LiveActivityStart')
      expect(starts).toHaveLength(1)
    })

    it('skips the start when one was dispatched inside the cooldown', async () => {
      const laMessages = await runWithStartToken(
        startToken({ lastStartSentAt: new Date(Date.now() - 5 * 60_000) }),
        1
      )
      expect(laMessages).toHaveLength(0)
    })

    // Prod 2026-09-11: overdue digest at 06:42 local, regular reminder at
    // 09:00 — the phone never confirmed the first start, so the second care
    // message must not open a second identical card.
    it('skips a start hours later while the earlier one is still unconfirmed', async () => {
      const laMessages = await runWithStartToken(
        startToken({
          lastStartSentAt: new Date(Date.now() - 2 * 3_600_000),
          lastConfirmedAt: null,
        }),
        1
      )
      expect(laMessages).toHaveLength(0)
    })

    it('starts again when the device confirmed the earlier start', async () => {
      // Confirmed after the start was sent, yet no active update row exists:
      // that activity has since ended, so a fresh card is correct.
      const laMessages = await runWithStartToken(
        startToken({
          lastStartSentAt: new Date(Date.now() - 2 * 3_600_000),
          lastConfirmedAt: new Date(Date.now() - 3_600_000),
        }),
        1
      )
      const starts = laMessages.filter((m) => m._tag === 'LiveActivityStart')
      expect(starts).toHaveLength(1)
    })

    it('ignores a confirmation that predates the last start', async () => {
      const laMessages = await runWithStartToken(
        startToken({
          lastStartSentAt: new Date(Date.now() - 3_600_000),
          lastConfirmedAt: new Date(Date.now() - 2 * 3_600_000),
        }),
        1
      )
      expect(laMessages).toHaveLength(0)
    })

    it('starts again once the cooldown has elapsed', async () => {
      const laMessages = await runWithStartToken(
        startToken({ lastStartSentAt: new Date(Date.now() - 11 * 3_600_000) }),
        1
      )
      const starts = laMessages.filter((m) => m._tag === 'LiveActivityStart')
      expect(starts).toHaveLength(1)
    })
  })
  describe('Live Activity on every device', () => {
    const row = (
      kind: ActivityPushToken['kind'],
      device: number,
      overrides: Partial<ActivityPushToken> = {}
    ): ActivityPushToken => ({
      id: `apt-${kind}-${device}`,
      userId: 'user-1',
      deviceTokenId: `token-${device}`,
      kind,
      activityId: kind === 'update' ? `activity-${device}` : null,
      token: `${kind}-token-${device}`,
      status: 'active',
      startedAt: new Date(),
      endsAt: null,
      lastConfirmedAt: null,
      lastFailedAt: null,
      lastStartSentAt: null,
      updatedAt: new Date(),
      ...overrides,
    })

    const sentTo = (
      messages: LiveActivityPushMessage[],
      tag: LiveActivityPushMessage['_tag']
    ) =>
      Array.map(
        Array.filter(messages, (m) => m._tag === tag),
        (m) => m.to
      ).sort()

    const runWithTokens = (
      tokens: ActivityPushToken[],
      failLiveActivity?: MockPushServiceOptions['failLiveActivity']
    ) =>
      runWithDeviceTokens({
        tokens,
        ...(failLiveActivity ? { failLiveActivity } : {}),
      }).then((r) => r.laMessages)

    it('updates both cards when the user has two active activities', async () => {
      const sent = await runWithTokens([
        row('update', 1),
        row('update', 2),
        row('start', 1),
        row('start', 2),
      ])
      expect(sentTo(sent, 'LiveActivityUpdate')).toEqual([
        'update-token-1',
        'update-token-2',
      ])
      expect(sentTo(sent, 'LiveActivityStart')).toEqual([])
    })

    it('updates the running card and starts one on the device without a card', async () => {
      const sent = await runWithTokens([
        row('update', 1),
        row('start', 1),
        row('start', 2),
      ])
      expect(sentTo(sent, 'LiveActivityUpdate')).toEqual(['update-token-1'])
      expect(sentTo(sent, 'LiveActivityStart')).toEqual(['start-token-2'])
    })

    it('skips the start on a device whose earlier start is still unconfirmed', async () => {
      const sent = await runWithTokens([
        row('update', 1),
        row('start', 2, { lastStartSentAt: new Date(Date.now() - 5 * 60_000) }),
      ])
      expect(sentTo(sent, 'LiveActivityUpdate')).toEqual(['update-token-1'])
      expect(sentTo(sent, 'LiveActivityStart')).toEqual([])
    })

    it('still updates the other device when one update fails', async () => {
      const sent = await runWithTokens(
        [row('update', 1), row('update', 2), row('start', 1)],
        (m) =>
          m.to === 'update-token-1'
            ? Option.some(new PushSendError({ message: 'APNs 500' }))
            : Option.none()
      )
      expect(sentTo(sent, 'LiveActivityUpdate')).toEqual([
        'update-token-1',
        'update-token-2',
      ])
      expect(sentTo(sent, 'LiveActivityStart')).toEqual([])
    })

    it('starts a fresh card only on the device whose update token died', async () => {
      const sent = await runWithTokens(
        [row('update', 1), row('update', 2), row('start', 1), row('start', 2)],
        (m) =>
          m.to === 'update-token-1'
            ? Option.some(
                new PushTokenInvalidatedError({
                  message: 'gone',
                  reason: 'Unregistered',
                })
              )
            : Option.none()
      )
      expect(sentTo(sent, 'LiveActivityUpdate')).toEqual([
        'update-token-1',
        'update-token-2',
      ])
      expect(sentTo(sent, 'LiveActivityStart')).toEqual(['start-token-1'])
    })

    it('leaves another user’s cards alone', async () => {
      const sent = await runWithTokens([
        row('update', 1),
        row('update', 2, { userId: 'user-2' }),
        row('start', 3, { userId: 'user-2' }),
      ])
      expect(sentTo(sent, 'LiveActivityUpdate')).toEqual(['update-token-1'])
      expect(sentTo(sent, 'LiveActivityStart')).toEqual([])
    })

    const failOn =
      (
        to: string,
        error: PushSendError | PushConfigError | PushTokenInvalidatedError
      ): MockPushServiceOptions['failLiveActivity'] =>
      (m) =>
        m.to === to ? Option.some(error) : Option.none()

    const gone = () =>
      new PushTokenInvalidatedError({ message: 'gone', reason: 'Unregistered' })

    it('starts a card on every device that has none', async () => {
      const sent = await runWithTokens([row('start', 1), row('start', 2)])
      expect(sentTo(sent, 'LiveActivityStart')).toEqual([
        'start-token-1',
        'start-token-2',
      ])
    })

    it('keeps the card and starts nothing when an update hits an APNs config error', async () => {
      const sent = await runWithTokens(
        [row('update', 1), row('update', 2), row('start', 1)],
        failOn('update-token-1', new PushConfigError({ message: 'no key' }))
      )
      expect(sentTo(sent, 'LiveActivityUpdate')).toEqual([
        'update-token-1',
        'update-token-2',
      ])
      expect(sentTo(sent, 'LiveActivityStart')).toEqual([])
    })

    it('marks a dead update row ended so the next push does not update it again', async () => {
      const { laMessages, stillActive } = await runWithDeviceTokens({
        tokens: [row('update', 1), row('update', 2), row('start', 1)],
        runs: 2,
        failLiveActivity: failOn('update-token-1', gone()),
      })
      expect(
        Array.filter(
          laMessages,
          (m) => m._tag === 'LiveActivityUpdate' && m.to === 'update-token-1'
        )
      ).toHaveLength(1)
      expect(stillActive).toEqual(['update-token-2'])
    })

    it('leaves the cooldown free on a device that shows a card, so it can start when that card dies', async () => {
      let updatesToFirst = 0
      const { laMessages } = await runWithDeviceTokens({
        tokens: [row('update', 1), row('start', 1), row('start', 2)],
        runs: 2,
        failLiveActivity: (m) => {
          if (m.to !== 'update-token-1') return Option.none()
          updatesToFirst++
          return updatesToFirst > 1 ? Option.some(gone()) : Option.none()
        },
      })
      expect(
        Array.map(
          Array.filter(laMessages, (m) => m._tag === 'LiveActivityStart'),
          (m) => m.to
        )
      ).toEqual(['start-token-2', 'start-token-1'])
    })

    it('does not retry the regular push when a Live Activity start fails', async () => {
      const sent = await runWithTokens(
        [row('update', 1), row('start', 2)],
        failOn('start-token-2', new PushSendError({ message: 'APNs 500' }))
      )
      expect(sentTo(sent, 'LiveActivityStart')).toEqual(['start-token-2'])
      expect(sentTo(sent, 'LiveActivityUpdate')).toEqual(['update-token-1'])
    })

    it('keeps every Live Activity token out of the worker logs when updates and starts fail', async () => {
      const { laMessages, logs } = await runWithDeviceTokens({
        tokens: [row('update', 1), row('update', 2), row('start', 3)],
        failLiveActivity: (m) =>
          Option.some(
            m.to === 'update-token-2'
              ? new PushConfigError({ message: 'no key' })
              : new PushSendError({ message: 'APNs 500' })
          ),
      })
      expect(sentTo(laMessages, 'LiveActivityStart')).toEqual(['start-token-3'])
      const text = inspect(logs, { depth: Number.POSITIVE_INFINITY })
      expect(text).toContain('LA update failed')
      expect(text).not.toMatch(/(update|start)-token-\d/)
    })

    it("refreshes the caretaker's cards, not the owner's, for a delegated plant", async () => {
      const { laMessages } = await runWithDeviceTokens({
        delegated: true,
        tokens: [row('update', 1), row('update', 2, { userId: 'user-2' })],
      })
      expect(sentTo(laMessages, 'LiveActivityUpdate')).toEqual([
        'update-token-1',
      ])
    })
  })
  describe('dead plant guard', () => {
    const runWithPlants = async (
      plants: ReturnType<typeof createTestPlant>[],
      plantIds: string[],
      canopyLayer?: Layer.Layer<CanopyRepository>,
      delegationLayer?: Layer.Layer<DelegationRepository>,
      rows?: Notification[]
    ) => {
      const sentMessages: PushMessage[] = []
      const notification = createPlantRow({
        id: 'notification-1',
        userId: 'user-1',
        plantId: 'plant-1',
        status: 'queued',
      })
      const notifications = rows ?? [notification]
      await Effect.runPromise(
        processMessage(
          createTestQueueMessage({
            topic: 'watering_reminder',
            payload: {
              userId: 'user-1',
              notificationIds: Array.map(notifications, (n) => n.id),
              plantIds,
            },
          })
        ).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({
                onSendBatch: (msgs) => sentMessages.push(...msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository(notifications),
              createMockPlantRepository({ plants }),
              LaMocksLive,
              canopyLayer ?? Layer.empty,
              delegationLayer ?? Layer.empty
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )
      return { sentMessages, notification, notifications }
    }

    it('deletes a care row whose plant is dead and sends nothing', async () => {
      const dead = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        diedAt: new Date(),
      })
      const { sentMessages, notifications } = await runWithPlants(
        [dead],
        ['plant-1']
      )

      expect(sentMessages).toHaveLength(0)
      expect(notifications).toEqual([])
    })

    it('drops a care push for a Canopy plant whose Canopy the user has left', async () => {
      const leftBehind = createTestPlant({
        id: 'plant-1',
        userId: null,
        canopyId: 'canopy-2',
      })
      const { sentMessages, notifications } = await runWithPlants(
        [leftBehind],
        ['plant-1']
      )

      expect(sentMessages).toHaveLength(0)
      expect(notifications).toEqual([])
    })

    it('drops a care push for a Canopy plant the user has muted since', async () => {
      const shared = createTestPlant({
        id: 'plant-1',
        userId: null,
        canopyId: 'canopy-1',
      })
      const { sentMessages, notifications } = await runWithPlants(
        [shared],
        ['plant-1'],
        createMockCanopyRepository(
          createCanopyStore({
            members: [
              createTestMembership({
                userId: 'user-1',
                canopyId: 'canopy-1' as CanopyId,
              }),
            ],
            mutes: [{ userId: 'user-1', plantId: 'plant-1' }],
          })
        )
      )

      expect(sentMessages).toHaveLength(0)
      expect(notifications).toEqual([])
    })

    const activeDelegation = (
      ownerId: string,
      caretakerId: string,
      status: DelegationRow['status']
    ): DelegationRow => ({
      id: 'delegation-1',
      ownerId,
      caretakerId,
      status,
      message: null,
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 86_400_000),
      respondedAt: null,
      canceledAt: null,
      completedAt: status === 'completed' ? new Date() : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    it('delivers an owner care push for a plant delegated after its row was written', async () => {
      const own = createTestPlant({ id: 'plant-1', userId: 'user-1' })
      const { sentMessages, notification } = await runWithPlants(
        [own],
        ['plant-1'],
        undefined,
        createMockDelegationRepository({
          delegations: [activeDelegation('user-1', 'user-2', 'active')],
          delegationPlants: [
            { delegationId: 'delegation-1', plantId: 'plant-1' },
          ],
        })
      )

      expect(sentMessages.length).toBeGreaterThan(0)
      expect(notification.status).toBe('sent')
    })

    it('deletes a caretaker care row after the delegation completed', async () => {
      const theirs = createTestPlant({ id: 'plant-1', userId: 'user-2' })
      const { sentMessages, notifications } = await runWithPlants(
        [theirs],
        ['plant-1'],
        undefined,
        createMockDelegationRepository({
          delegations: [activeDelegation('user-2', 'user-1', 'completed')],
          delegationPlants: [
            { delegationId: 'delegation-1', plantId: 'plant-1' },
          ],
        })
      )

      expect(sentMessages).toHaveLength(0)
      expect(notifications).toEqual([])
    })

    it('delivers a caretaker care push while the delegation is active', async () => {
      const theirs = createTestPlant({ id: 'plant-1', userId: 'user-2' })
      const { sentMessages, notification } = await runWithPlants(
        [theirs],
        ['plant-1'],
        undefined,
        createMockDelegationRepository({
          delegations: [activeDelegation('user-2', 'user-1', 'active')],
          delegationPlants: [
            { delegationId: 'delegation-1', plantId: 'plant-1' },
          ],
        })
      )

      expect(sentMessages.length).toBeGreaterThan(0)
      expect(notification.status).toBe('sent')
    })

    it('names only the plants still theirs when the guard drops some', async () => {
      const leftBehind = createTestPlant({
        id: 'plant-1',
        name: 'Left Behind',
        userId: null,
        canopyId: 'canopy-2',
      })
      const fern = createTestPlant({
        id: 'plant-2',
        name: 'Fern',
        userId: 'user-1',
      })
      const rows = [
        createPlantRow({
          id: 'notification-1',
          userId: 'user-1',
          plantId: 'plant-1',
          type: 'watering_reminder',
          status: 'queued',
        }),
        createPlantRow({
          id: 'notification-2',
          userId: 'user-1',
          plantId: 'plant-2',
          type: 'watering_reminder',
          status: 'queued',
        }),
      ]
      const { sentMessages } = await runWithPlants(
        [leftBehind, fern],
        ['plant-1', 'plant-2'],
        undefined,
        undefined,
        rows
      )

      const push = sentMessages[0]
      expect(push).toBeDefined()
      expect(`${push?.title} ${push?.body}`).toContain('Fern')
      expect(`${push?.title} ${push?.body}`).not.toContain('Left Behind')
      expect(push?.data?.plantIds).toBe('plant-2')
      expect(Array.map(rows, (n) => [n.id, n.status])).toEqual([
        ['notification-2', 'sent'],
      ])
    })

    it('delivers a care push for a Canopy plant of the Canopy the user is in', async () => {
      const shared = createTestPlant({
        id: 'plant-1',
        userId: null,
        canopyId: 'canopy-1',
      })
      const { sentMessages } = await runWithPlants([shared], ['plant-1'])

      expect(sentMessages.length).toBeGreaterThan(0)
    })

    it('sends nothing when the living plants have none of the claimed rows', async () => {
      const dead = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        diedAt: new Date(),
      })
      const alive = createTestPlant({ id: 'plant-2', userId: 'user-1' })
      const { sentMessages } = await runWithPlants(
        [dead, alive],
        ['plant-1', 'plant-2'],
        undefined,
        undefined,
        [
          createPlantRow({
            id: 'notification-1',
            userId: 'user-1',
            plantId: 'plant-1',
            status: 'queued',
          }),
        ]
      )

      expect(sentMessages).toHaveLength(0)
    })

    it('sends nothing when the living plant has only a non-care row', async () => {
      const dead = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        diedAt: new Date(),
      })
      const alive = createTestPlant({ id: 'plant-2', userId: 'user-1' })
      const { sentMessages } = await runWithPlants(
        [dead, alive],
        ['plant-1', 'plant-2'],
        undefined,
        undefined,
        [
          createPlantRow({
            id: 'notification-1',
            userId: 'user-1',
            plantId: 'plant-1',
            type: 'watering_reminder',
            status: 'queued',
          }),
          createPlantRow({
            id: 'notification-2',
            userId: 'user-1',
            plantId: 'plant-2',
            type: 'photo_reminder',
            status: 'queued',
          }),
        ]
      )

      expect(sentMessages).toHaveLength(0)
    })

    it('still delivers when at least one plant is living, naming only that one', async () => {
      const dead = createTestPlant({
        id: 'plant-1',
        name: 'Buried',
        userId: 'user-1',
        diedAt: new Date(),
      })
      const alive = createTestPlant({
        id: 'plant-2',
        name: 'Fern',
        userId: 'user-1',
      })
      const { sentMessages } = await runWithPlants(
        [dead, alive],
        ['plant-1', 'plant-2'],
        undefined,
        undefined,
        [
          createPlantRow({
            id: 'notification-1',
            userId: 'user-1',
            plantId: 'plant-1',
            status: 'queued',
          }),
          createPlantRow({
            id: 'notification-2',
            userId: 'user-1',
            plantId: 'plant-2',
            status: 'queued',
          }),
        ]
      )

      expect(sentMessages.length).toBeGreaterThan(0)
      expect(sentMessages[0]?.body).not.toContain('Buried')
      expect(sentMessages[0]?.data?.plantIds).toBe('plant-2')
    })

    it('renames a queued digest to the living plant when the other is buried before the send', async () => {
      const buried = createTestPlant({
        id: 'plant-1',
        name: 'Aloe',
        userId: 'user-1',
        diedAt: new Date(),
      })
      const living = createTestPlant({
        id: 'plant-2',
        name: 'Fern',
        userId: 'user-1',
      })
      const rows = Array.map([buried, living], (plant, index) =>
        createPlantRow({
          id: `notification-${index + 1}`,
          userId: 'user-1',
          plantId: plant.id,
          type: 'watering_reminder',
          status: 'queued',
        })
      )
      const sentMessages: PushMessage[] = []

      await Effect.runPromise(
        processMessage(
          createTestQueueMessage({
            topic: 'watering_reminder',
            payload: {
              userId: 'user-1',
              ...buildCareDigestContent(
                [
                  { plantName: 'Aloe', careTypes: ['watering_reminder'] },
                  { plantName: 'Fern', careTypes: ['watering_reminder'] },
                ],
                'en'
              ),
              notificationIds: ['notification-1', 'notification-2'],
              plantIds: ['plant-1', 'plant-2'],
            },
          })
        ).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({
                onSendBatch: (msgs) => sentMessages.push(...msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository(rows),
              createMockPlantRepository({ plants: [buried, living] }),
              LaMocksLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      const fernOnly = buildCareDigestContent(
        [{ plantName: 'Fern', careTypes: ['watering_reminder'] }],
        'en'
      )
      expect(
        Array.dedupe(
          Array.map(
            sentMessages,
            (push) => `${push.title}|${push.body}|${push.data?.plantIds}`
          )
        )
      ).toEqual([`${fernOnly.title}|${fernOnly.body}|plant-2`])
      expect(Array.map(rows, (row) => [row.id, row.status])).toEqual([
        ['notification-2', 'sent'],
      ])
    })
  })

  describe('dispatch gate at delivery', () => {
    const hhmm = (offsetMs: number) =>
      new Date(Date.now() + offsetMs).toISOString().slice(11, 16)
    const quietNow = {
      doNotDisturb: true,
      doNotDisturbStart: hhmm(-3_600_000),
      doNotDisturbEnd: hhmm(3_600_000),
      timezone: 'UTC',
    }

    const deliver = async (
      message: QueueMessage,
      rows: Notification[],
      userOverrides: Partial<Parameters<typeof createTestUser>[0]>,
      plants: ReturnType<typeof createTestPlant>[] = [
        createTestPlant({ id: 'plant-1', userId: 'user-1' }),
      ],
      logger: Layer.Layer<never> = Logger.layer([])
    ) => {
      const sentMessages: PushMessage[] = []
      await Effect.runPromise(
        processMessage(message).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockPushService({
                onSendBatch: (msgs) => sentMessages.push(...msgs),
              }),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository(rows),
              createMockPlantRepository({ plants }),
              LaMocksLive,
              createMockUserRepository([
                createTestUser({ id: 'user-1', ...userOverrides }),
              ]),
              logger
            )
          )
        )
      )
      return sentMessages
    }

    const NIGHT = new Date('2026-06-15T23:00:00.000Z')
    const DND_END = new Date('2026-06-16T07:00:00.000Z')
    const nightDnd = (doNotDisturbEnd: string) => ({
      doNotDisturb: true,
      doNotDisturbStart: '22:00',
      doNotDisturbEnd,
      timezone: 'UTC',
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('moves a row claimed during DND back to pending at the end of DND', async () => {
      const rows = [
        createPlantRow({
          id: 'notification-1',
          plantId: 'plant-1',
          status: 'queued',
        }),
      ]
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(NIGHT)
      const sent = await deliver(
        createTestQueueMessage(),
        rows,
        nightDnd('07:00')
      )

      expect(sent).toHaveLength(0)
      expect(rows.map((n) => [n.status, n.scheduledAt])).toEqual([
        ['pending', DND_END],
      ])
    })

    it("reads a user's DND bounds once however many of their rows the message claims", async () => {
      const ids = ['notification-1', 'notification-2', 'notification-3']
      const rows = Array.map(ids, (id) =>
        createPlantRow({ id, plantId: 'plant-1', status: 'queued' })
      )
      const warnings: unknown[] = []
      const capture = Logger.make(({ logLevel, message, fiber }) => {
        if (logLevel === 'Warn') {
          warnings.push({
            message,
            userId: fiber.getRef(References.CurrentLogAnnotations).userId,
          })
        }
      })
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(NIGHT)
      const sent = await deliver(
        createTestQueueMessage({
          payload: {
            userId: 'user-1',
            notificationIds: ids,
            plantIds: ['plant-1'],
          },
        }),
        rows,
        nightDnd('25:99'),
        undefined,
        Logger.layer([capture])
      )

      expect(sent).toHaveLength(0)
      expect(warnings).toEqual([
        {
          message: [
            'Invalid DND bound, using the default',
            { rejected: '25:99', fallback: '07:00' },
          ],
          userId: 'user-1',
        },
      ])
      expect(rows.map((n) => [n.id, n.status, n.scheduledAt])).toEqual(
        Array.map(ids, (id) => [id, 'pending', DND_END])
      )
    })

    it('deletes an engagement row sent straight from the caller when tips are off', async () => {
      const rows = [
        createPlantRow({
          id: 'notification-1',
          type: 'resubscribe_nudge',
          status: 'queued',
        }),
      ]
      const sent = await deliver(
        createTestQueueMessage({
          topic: 'resubscribe_nudge',
          payload: {
            userId: 'user-1',
            notificationIds: ['notification-1'],
            plantIds: [],
          },
        }),
        rows,
        { ...quietNow, tips: false }
      )

      expect(sent).toHaveLength(0)
      expect(rows).toEqual([])
    })

    it('gates a care row by its own plant when the message names no plant', async () => {
      const rows = [
        createPlantRow({
          id: 'notification-1',
          plantId: 'plant-1',
          status: 'queued',
        }),
      ]
      const sent = await deliver(
        createTestQueueMessage({
          payload: {
            userId: 'user-1',
            notificationIds: ['notification-1'],
            plantIds: [],
          },
        }),
        rows,
        {},
        [
          createTestPlant({
            id: 'plant-1',
            userId: 'user-1',
            diedAt: new Date(),
          }),
        ]
      )

      expect(sent).toHaveLength(0)
      expect(rows).toEqual([])
    })

    it('sends a social row during a vacation', async () => {
      const rows = [
        createPlantRow({
          id: 'notification-1',
          type: 'new_follower',
          status: 'queued',
        }),
      ]
      const sent = await deliver(
        createTestQueueMessage({
          topic: 'new_follower',
          payload: {
            userId: 'user-1',
            notificationIds: ['notification-1'],
            plantIds: [],
          },
        }),
        rows,
        {
          vacationStatus: 'active',
          vacationEnd: new Date(Date.now() + 86_400_000),
        }
      )

      expect(sent.length).toBeGreaterThan(0)
      expect(rows[0]?.status).toBe('sent')
    })
  })

  describe('delivery claims', () => {
    const queuedRow = (id: string) =>
      createPlantRow({ id, userId: 'user-1', status: 'queued' })

    const deliveryLayer = (
      notificationRepo: Layer.Layer<NotificationRepository>,
      onSendBatch: (msgs: PushMessage[]) => void
    ) =>
      Layer.mergeAll(
        MockAlerterLive,
        createMockPushService({ onSendBatch }),
        createMockDeviceTokenRepository(mockDeviceTokens),
        notificationRepo,
        LaMocksLive,
        LivingPlantsLive
      )

    it('sends nothing for a message whose rows another message already claimed', async () => {
      const batches: PushMessage[][] = []
      const layer = deliveryLayer(
        createMockNotificationRepository([queuedRow('notification-1')], {
          deliveryClaims: { 'notification-1': 'msg-first' },
        }),
        (msgs) => batches.push(msgs)
      )
      const run = (id: string) =>
        Effect.runPromise(
          processMessage(createTestQueueMessage({ id })).pipe(
            Effect.provide(layer),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )

      await run('msg-duplicate')
      expect(batches).toHaveLength(0)

      await run('msg-first')
      expect(batches).toHaveLength(1)
    })

    it('does not resend the push when bookkeeping fails after it went out', async () => {
      const notification = queuedRow('notification-1')
      const batches: PushMessage[][] = []
      const requeued: QueueMessage[] = []
      const acked: string[] = []
      const alerter = createMockAlerter()
      const dbDown = new SqlError({
        reason: new UnknownError({ cause: 'db down', message: 'db down' }),
      })
      const bookkeepingFails = Layer.effect(
        NotificationRepository,
        Effect.map(NotificationRepository, (repo) => ({
          ...repo,
          markManyAsSent: () => Effect.fail(dbDown),
        }))
      ).pipe(Layer.provide(createMockNotificationRepository([notification])))
      const queueMessages = [createTestQueueMessage({ id: 'msg-once' })]
      const layer = Layer.mergeAll(
        alerter.layer,
        createMockPushService({ onSendBatch: (msgs) => batches.push(msgs) }),
        createMockDeviceTokenRepository(mockDeviceTokens),
        bookkeepingFails,
        createMockMessageQueue({
          onDequeue: () => {
            const msg = pipe(
              Option.fromNullishOr(queueMessages.shift()),
              Option.getOrNull
            )
            return msg ? { message: msg, rawData: JSON.stringify(msg) } : null
          },
          onEnqueue: (_, message) => requeued.push(message),
          onAck: (rawData) => acked.push(rawData),
        }),
        createMockDeadLetterRepository(),
        LaMocksLive,
        LivingPlantsLive
      )

      await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            consumeNext.pipe(Effect.provide(layer))
          )
          yield* Effect.forEach(Array.range(1, 30), () =>
            TestClock.adjust('1 second')
          )
          yield* Fiber.join(fiber)
        }).pipe(
          Effect.scoped,
          Effect.provide(TestClock.layer()),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(batches).toHaveLength(1)
      expect(requeued).toHaveLength(0)
      expect(acked).toHaveLength(1)
      expect(
        Array.some(
          alerter.events,
          (e) =>
            e._tag === 'warning' &&
            e.summary === 'Push sent but delivery bookkeeping failed'
        )
      ).toBe(true)
    })

    it('starts one Live Activity across two messages for the same user', async () => {
      const laMessages: LiveActivityPushMessage[] = []
      const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
      const layer = Layer.mergeAll(
        MockAlerterLive,
        createMockPushService({
          onSendLiveActivity: (m) => laMessages.push(m),
        }),
        createMockDeviceTokenRepository(mockDeviceTokens),
        createMockNotificationRepository([
          queuedRow('notification-1'),
          queuedRow('notification-2'),
        ]),
        createMockActivityPushTokenRepository({
          tokens: [
            {
              id: 'apt-1',
              userId: 'user-1',
              deviceTokenId: 'token-1',
              kind: 'start',
              activityId: null,
              token: 'start-token-1',
              status: 'active',
              startedAt: new Date(),
              endsAt: null,
              lastConfirmedAt: null,
              lastFailedAt: null,
              lastStartSentAt: null,
              updatedAt: new Date(),
            },
          ],
        }),
        createMockCareScheduleRepository({
          plants: [plant],
          schedules: [
            createTestSchedule({
              plantId: 'plant-1',
              careType: 'watering',
              nextCareAt: new Date(Date.now() - 60_000),
            }),
          ],
        }),
        createMockCareLogRepository([]),
        createMockUserRepository([
          createTestUser({ id: 'user-1', timezone: 'UTC' }),
        ]),
        createMockPlantRepository({ plants: [plant] }),
        createMockCanopyRepository(),
        createMockDelegationRepository()
      )
      const run = (id: string, notificationId: string) =>
        Effect.runPromise(
          processMessage(
            createTestQueueMessage({
              id,
              payload: {
                userId: 'user-1',
                notificationIds: [notificationId],
                plantIds: ['plant-1'],
              },
            })
          ).pipe(
            Effect.provide(layer),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )

      await run('msg-morning', 'notification-1')
      await run('msg-afternoon', 'notification-2')

      const starts = Array.filter(
        laMessages,
        (m) => m._tag === 'LiveActivityStart'
      )
      expect(starts).toHaveLength(1)
    })
  })

  describe('startNotificationWorker', () => {
    const queuedRow = (id: string) =>
      createPlantRow({ id, userId: 'user-1', status: 'queued' })

    const redisQueue = (ready: unknown[], acked: string[]) => {
      const processing = new Set<string>()
      const mock = createMockMessageQueue({
        onAck: (rawData) => {
          acked.push(rawData)
          processing.delete(rawData)
        },
        onRequeueStale: () => {
          const stale = Array.fromIterable(processing)
          processing.clear()
          Array.forEach(stale, (rawData) => ready.push(JSON.parse(rawData)))
          return stale.length
        },
      })
      return Layer.effect(
        MessageQueue,
        Effect.map(MessageQueue, (queue) => ({
          ...queue,
          dequeue: Effect.suspend(() =>
            Option.match(Option.fromNullishOr(ready.shift()), {
              onNone: () => Effect.succeed(null),
              onSome: (entry) => {
                const rawData = JSON.stringify(entry)
                processing.add(rawData)
                return decodeQueueEntry(rawData, rawData)
              },
            })
          ),
        }))
      ).pipe(Layer.provide(mock))
    }

    const workerLayer = (options: {
      queue: Layer.Layer<MessageQueue>
      push: Layer.Layer<PushService>
      rows: Notification[]
      alerter: Layer.Layer<Alerter>
      deadLetters?: Layer.Layer<DeadLetterRepository>
      deliveryClaims?: Record<string, string>
      queuedAt?: Record<string, Date>
    }) =>
      Layer.mergeAll(
        options.alerter,
        options.queue,
        options.push,
        createMockDeviceTokenRepository(mockDeviceTokens),
        createMockNotificationRepository(options.rows, {
          deliveryClaims: options.deliveryClaims ?? {},
          queuedAt: options.queuedAt ?? {},
        }),
        pipe(
          Option.fromNullishOr(options.deadLetters),
          Option.getOrElse(() => createMockDeadLetterRepository())
        ),
        LaMocksLive,
        LivingPlantsLive
      )

    const runWorkersAndTimeDrain = (
      layer: ReturnType<typeof workerLayer>,
      stopAt: Duration.Input
    ) =>
      Effect.gen(function* () {
        const scope = yield* Scope.make()
        // adjust waits for work in fibers the clock wakes, not for work
        // already running, so the workers start from a woken fiber.
        const starting = yield* Effect.forkChild(
          Effect.sleep('1 millis').pipe(
            Effect.andThen(
              Layer.buildWithScope(
                Layer.effectDiscard(startNotificationWorker).pipe(
                  Layer.provide(layer)
                ),
                scope
              )
            )
          )
        )
        yield* TestClock.adjust(stopAt)
        yield* Fiber.join(starting)
        const closing = yield* Effect.forkChild(
          Scope.close(scope, Exit.void).pipe(Effect.timed)
        )
        yield* TestClock.adjust('30 seconds')
        const [drained] = yield* Fiber.join(closing)
        return drained
      }).pipe(
        Effect.scoped,
        Effect.provide(TestClock.layer()),
        Effect.provideService(References.MinimumLogLevel, 'None'),
        Effect.runPromise
      )

    const slowPush = (batches: PushMessage[][]) =>
      Layer.effect(
        PushService,
        Effect.map(PushService, (push) => ({
          ...push,
          sendBatch: (msgs: PushMessage[]) =>
            push
              .sendBatch(msgs)
              .pipe(Effect.tap(() => Effect.sleep('5 seconds'))),
        }))
      ).pipe(
        Layer.provide(
          createMockPushService({ onSendBatch: (msgs) => batches.push(msgs) })
        )
      )

    const pastTheFirstPolls = '1 minute'
    const valid = createTestQueueMessage({
      id: 'msg-valid',
      payload: {
        ...createTestQueueMessage().payload,
        notificationIds: [rowId('1')],
      },
    })
    const poisonMessages = {
      noPayload: {
        topic: 'bogus_topic',
        messageId: 'msg-d1',
        notificationIds: [rowId('d1')],
      },
      nullPayload: {
        ...createTestQueueMessage({ id: 'msg-d2' }),
        payload: null,
      },
      emptyPayload: {
        ...createTestQueueMessage({ id: 'msg-d3' }),
        payload: {},
      },
      noPlantIds: {
        ...createTestQueueMessage({ id: 'msg-d4' }),
        payload: Struct.omit(
          {
            ...valid.payload,
            notificationIds: [rowId('d4'), rowId('other')],
          },
          ['plantIds']
        ),
      },
      nullPlantIds: {
        ...createTestQueueMessage({ id: 'msg-d5' }),
        payload: {
          ...valid.payload,
          notificationIds: [rowId('d5')],
          plantIds: null,
        },
      },
    }

    it('discards each message that fails to decode and delivers the next one at once', async () => {
      const rows = {
        d1: queuedRow(rowId('d1')),
        d4: queuedRow(rowId('d4')),
        d5: queuedRow(rowId('d5')),
        other: queuedRow(rowId('other')),
        valid: queuedRow(rowId('1')),
      }
      const unclaimed = { d1: { ...rows.d1 }, other: { ...rows.other } }
      const poisons = Record.values(poisonMessages)
      const sentAt: number[] = []
      const acked: string[] = []
      const alerter = createMockAlerter()
      const deadLetters = createMockDeadLetterRepositoryWithCapture()
      const clockedPush = Layer.effect(
        PushService,
        Effect.map(PushService, (push) => ({
          ...push,
          sendBatch: (msgs: PushMessage[]) =>
            Clock.currentTimeMillis.pipe(
              Effect.tap((now) => Effect.sync(() => sentAt.push(now))),
              Effect.andThen(push.sendBatch(msgs))
            ),
        }))
      ).pipe(Layer.provide(createMockPushService()))

      await runWorkersAndTimeDrain(
        workerLayer({
          queue: redisQueue([...poisons, valid], acked),
          push: clockedPush,
          rows: Record.values(rows),
          alerter: alerter.layer,
          deadLetters: deadLetters.layer,
          deliveryClaims: { [rowId('other')]: 'msg-other' },
        }),
        pastTheFirstPolls
      )

      expect(sentAt).toEqual([1])
      expect(rows.valid.status).toBe('sent')
      expect(acked).toEqual(
        Array.map([...poisons, valid], (m) => JSON.stringify(m))
      )
      const ids = ['msg-d1', 'msg-d2', 'msg-d3', 'msg-d4', 'msg-d5']
      expect(
        Array.map(deadLetters.capturedMessages, (d) => d.originalMessageId)
      ).toEqual(ids)
      expect(Array.map(deadLetters.capturedMessages, (d) => d.topic)).toEqual([
        'bogus_topic',
        'watering_reminder',
        'watering_reminder',
        'watering_reminder',
        'watering_reminder',
      ])
      expect(alerter.events).toEqual(
        Array.map(ids, (id) =>
          expect.objectContaining({
            _tag: 'UnhandledDefect',
            message: expect.stringMatching(/^\w+: \w/),
            stack: expect.stringMatching(`^message ${id}\n`),
          })
        )
      )
      expect(rows.d4.lastError).toBe('Missing key at ["payload"]["plantIds"]')
      expect(rows.d5.lastError).toBe(
        'Expected array at ["payload"]["plantIds"]'
      )
      expect(rows.d1).toEqual(unclaimed.d1)
      expect(rows.other).toEqual(unclaimed.other)
    })

    it('sends one alert for messages that fail to decode the same way', async () => {
      const sent: AlertEvent[] = []
      const alerter = Layer.effect(
        Alerter,
        makeAlerter((event) => Effect.sync(() => sent.push(event)), {
          environment: 'test',
          dedupeWindow: Duration.minutes(5),
          warningDedupeWindow: Duration.minutes(15),
        })
      )
      const deadLetters = createMockDeadLetterRepositoryWithCapture()
      const twins = Array.map(['a', 'b'], (id) => ({
        ...poisonMessages.nullPlantIds,
        id: `msg-${id}`,
        payload: {
          ...poisonMessages.nullPlantIds.payload,
          notificationIds: [rowId(id)],
        },
      }))

      await runWorkersAndTimeDrain(
        workerLayer({
          queue: redisQueue(twins, []),
          push: createMockPushService(),
          rows: [queuedRow(rowId('a')), queuedRow(rowId('b'))],
          alerter,
          deadLetters: deadLetters.layer,
        }),
        pastTheFirstPolls
      )

      expect(
        Array.map(deadLetters.capturedMessages, (d) => d.originalMessageId)
      ).toEqual(['msg-a', 'msg-b'])
      expect(sent).toEqual([
        expect.objectContaining({
          stack: expect.stringMatching(/^message msg-a\n/),
        }),
      ])
    })

    it('stores the raw text under its id when the first write fails, then acks and alerts once', async () => {
      const rows = [queuedRow(rowId('d5')), queuedRow(rowId('1'))]
      const poison = { ...poisonMessages.nullPlantIds, retryCount: 2 }
      const acked: string[] = []
      const alerter = createMockAlerter()
      const deadLetters = createMockDeadLetterRepositoryWithCapture()
      const writeFailures = [
        new SqlError({
          reason: new UnknownError({ cause: 'db down', message: 'db down' }),
        }),
      ]
      const failsOnce = Layer.effect(
        DeadLetterRepository,
        Effect.map(DeadLetterRepository, (repo) => ({
          create: (data: CreateDeadLetterData) =>
            Effect.suspend(() =>
              Option.match(Option.fromNullishOr(writeFailures.shift()), {
                onNone: () => repo.create(data),
                onSome: Effect.fail,
              })
            ),
        }))
      ).pipe(Layer.provide(deadLetters.layer))

      await runWorkersAndTimeDrain(
        workerLayer({
          queue: redisQueue([poison, valid], acked),
          push: createMockPushService(),
          rows,
          alerter: alerter.layer,
          deadLetters: failsOnce,
        }),
        pastTheFirstPolls
      )

      expect(
        Array.map(deadLetters.capturedMessages, (d) => [
          d.originalMessageId,
          d.retryCount,
          d.payload,
        ])
      ).toEqual([['msg-d5', 2, JSON.stringify(poison)]])
      expect(alerter.events).toHaveLength(1)
      expect(acked).toEqual([JSON.stringify(poison), JSON.stringify(valid)])
      expect(Array.map(rows, (r) => r.status)).toEqual(['failed', 'sent'])
    })

    it('dead-letters a decoded message that dies under its id and delivers the next one', async () => {
      const rows = [queuedRow(rowId('1')), queuedRow(rowId('2'))]
      const first = createTestQueueMessage({
        id: 'msg-1',
        payload: valid.payload,
      })
      const second = createTestQueueMessage({
        id: 'msg-2',
        payload: { ...valid.payload, notificationIds: [rowId('2')] },
      })
      const acked: string[] = []
      const alerter = createMockAlerter()
      const deadLetters = createMockDeadLetterRepositoryWithCapture()
      const pushDefects = [new Error('push broke')]
      const pushDiesOnce = Layer.effect(
        PushService,
        Effect.map(PushService, (push) => ({
          ...push,
          sendBatch: (msgs: PushMessage[]) =>
            Effect.suspend(() =>
              Option.match(Option.fromNullishOr(pushDefects.shift()), {
                onNone: () => push.sendBatch(msgs),
                onSome: Effect.die,
              })
            ),
        }))
      ).pipe(Layer.provide(createMockPushService()))

      await runWorkersAndTimeDrain(
        workerLayer({
          queue: redisQueue([first, second], acked),
          push: pushDiesOnce,
          rows,
          alerter: alerter.layer,
          deadLetters: deadLetters.layer,
        }),
        pastTheFirstPolls
      )

      expect(deadLetters.capturedMessages).toEqual([
        expect.objectContaining({
          originalMessageId: 'msg-1',
          topic: 'watering_reminder',
          retryCount: 0,
        }),
      ])
      expect(Array.map(rows, (r) => [r.status, r.lastError])).toEqual([
        ['failed', 'Error: push broke'],
        ['sent', undefined],
      ])
      expect(acked).toEqual([JSON.stringify(first), JSON.stringify(second)])
      expect(alerter.events).toEqual([
        expect.objectContaining({
          stack: expect.stringMatching(/^message msg-1\n/),
        }),
      ])
    })

    it('keeps polling after an ack dies', async () => {
      const rows = [queuedRow(rowId('1')), queuedRow(rowId('2'))]
      const first = createTestQueueMessage({
        id: 'msg-1',
        payload: valid.payload,
      })
      const second = createTestQueueMessage({
        id: 'msg-2',
        payload: { ...valid.payload, notificationIds: [rowId('2')] },
      })
      const acked: string[] = []
      const alerter = createMockAlerter()
      const ackDefects = [new Error('ack broke')]
      const ackDiesOnce = Layer.effect(
        MessageQueue,
        Effect.map(MessageQueue, (queue) => ({
          ...queue,
          ack: (rawData: string) =>
            Effect.suspend(() =>
              Option.match(Option.fromNullishOr(ackDefects.shift()), {
                onNone: () => queue.ack(rawData),
                onSome: Effect.die,
              })
            ),
        }))
      ).pipe(Layer.provide(redisQueue([first, second], acked)))

      await runWorkersAndTimeDrain(
        workerLayer({
          queue: ackDiesOnce,
          push: createMockPushService(),
          rows,
          alerter: alerter.layer,
        }),
        pastTheFirstPolls
      )

      expect(Array.map(rows, (r) => r.status)).toEqual(['sent', 'sent'])
      expect(acked).toEqual([JSON.stringify(second)])
      expect(alerter.events).toEqual([
        expect.objectContaining({
          _tag: 'UnhandledDefect',
          message: expect.stringContaining('ack broke'),
        }),
      ])
    })

    const pooledRun = (consumers: Option.Option<number>) => {
      const plan = [
        ['1', 'watering_reminder'],
        ['2', 'new_follower'],
        ['3', 'daily_tip'],
        ['4', 'watering_reminder'],
        ['5', 'new_follower'],
        ['6', 'daily_tip'],
      ] as const
      const rows = Array.map(plan, ([id, type]) => ({
        ...queuedRow(rowId(id)),
        type,
      }))
      const batches: PushMessage[][] = []
      const acked: string[] = []
      const messages = Array.map(plan, ([id, topic]) =>
        createTestQueueMessage({
          id: `msg-${id}`,
          topic,
          payload: { ...valid.payload, notificationIds: [rowId(id)] },
        })
      )
      const config = ConfigProvider.layer(
        ConfigProvider.fromUnknown(
          Option.match(consumers, {
            onNone: () => ({}),
            onSome: (n) => ({ NOTIFICATION_CONSUMERS: n }),
          })
        )
      )
      return runWorkersAndTimeDrain(
        Layer.mergeAll(
          workerLayer({
            queue: redisQueue(messages, acked),
            push: slowPush(batches),
            rows,
            alerter: MockAlerterLive,
          }),
          config
        ),
        '1 second'
      ).then((drained) => ({ rows, batches, acked, drained }))
    }

    it('runs four consumers by default and finishes each in-flight send on shutdown, within one step', async () => {
      const { rows, batches, acked, drained } = await pooledRun(Option.none())

      expect(batches).toHaveLength(4)
      expect(Array.map(rows, (r) => r.status)).toEqual([
        'sent',
        'sent',
        'sent',
        'sent',
        'queued',
        'queued',
      ])
      expect(acked).toHaveLength(4)
      expect(Duration.toMillis(drained)).toBeLessThan(5_000)
    })

    it('runs as many consumers as NOTIFICATION_CONSUMERS asks for', async () => {
      const { rows, batches } = await pooledRun(Option.some(2))

      expect(batches).toHaveLength(2)
      expect(Array.map(rows, (r) => r.status)).toEqual([
        'sent',
        'sent',
        'queued',
        'queued',
        'queued',
        'queued',
      ])
    })

    it('refuses to start with zero consumers', async () => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(startNotificationWorker).pipe(
          Effect.provide(
            Layer.mergeAll(
              workerLayer({
                queue: createMockMessageQueue(),
                push: createMockPushService(),
                rows: [],
                alerter: MockAlerterLive,
              }),
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({ NOTIFICATION_CONSUMERS: 0 })
              )
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(
        Exit.isFailure(exit) ? Cause.pretty(exit.cause) : 'started'
      ).toContain('NOTIFICATION_CONSUMERS')
    })

    it('pushes a message once when its send outlasts the visibility timeout', async () => {
      const rows = [queuedRow(rowId('1'))]
      const batches: PushMessage[][] = []
      const redis = createInMemoryRedisQueue([JSON.stringify(valid)])
      const stalledPush = Layer.effect(
        PushService,
        Effect.map(PushService, (push) => ({
          ...push,
          sendBatch: (msgs: PushMessage[]) =>
            push
              .sendBatch(msgs)
              .pipe(Effect.tap(() => Effect.sleep('20 minutes'))),
        }))
      ).pipe(
        Layer.provide(
          createMockPushService({ onSendBatch: (msgs) => batches.push(msgs) })
        )
      )

      await runWorkersAndTimeDrain(
        workerLayer({
          queue: Layer.succeed(MessageQueue, redis.queue),
          push: stalledPush,
          rows,
          alerter: MockAlerterLive,
          queuedAt: { [rowId('1')]: new Date() },
        }),
        '21 minutes'
      )

      expect(batches).toHaveLength(1)
      expect(redis.acked).toEqual([JSON.stringify(valid)])
      expect(redis.liveKeys()).toEqual([])
    })

    it('finishes and acks a send while its claim refresh keeps failing', async () => {
      const rows = [queuedRow(rowId('1'))]
      const batches: PushMessage[][] = []
      const redis = createInMemoryRedisQueue([JSON.stringify(valid)])
      let refreshes = 0
      const refreshFails = Layer.succeed(MessageQueue, {
        ...redis.queue,
        refreshClaim: () =>
          Effect.suspend(() => {
            refreshes++
            return Effect.fail(
              new QueueOperationError({ message: 'redis down', cause: null })
            )
          }),
      })
      const slowPush = Layer.effect(
        PushService,
        Effect.map(PushService, (push) => ({
          ...push,
          sendBatch: (msgs: PushMessage[]) =>
            Effect.sleep('3 minutes').pipe(
              Effect.andThen(push.sendBatch(msgs))
            ),
        }))
      ).pipe(
        Layer.provide(
          createMockPushService({ onSendBatch: (msgs) => batches.push(msgs) })
        )
      )

      await runWorkersAndTimeDrain(
        workerLayer({
          queue: refreshFails,
          push: slowPush,
          rows,
          alerter: MockAlerterLive,
          queuedAt: { [rowId('1')]: new Date() },
        }),
        '4 minutes'
      )

      expect(refreshes).toBeGreaterThan(0)
      expect(batches).toHaveLength(1)
      expect(redis.acked).toEqual([JSON.stringify(valid)])
    })

    it('refreshes a claim at least twice within the visibility timeout', () => {
      expect(Duration.toMillis(CLAIM_REFRESH_INTERVAL) * 2).toBeLessThanOrEqual(
        Duration.toMillis(VISIBILITY_TIMEOUT)
      )
    })

    it('delivers every topic from the one queue', async () => {
      const { batches } = await pooledRun(Option.some(4))

      const delivered = Array.flatMap(batches, (batch) =>
        Array.map(batch, (m) => [m.data?.topic, m.interruptionLevel])
      )
      expect(
        Array.dedupe(Array.map(delivered, ([topic]) => topic)).sort()
      ).toEqual(['daily_tip', 'new_follower', 'watering_reminder'])
      expect(delivered).toEqual(
        expect.arrayContaining([
          ['watering_reminder', 'time-sensitive'],
          ['new_follower', undefined],
          ['daily_tip', undefined],
        ])
      )
      expect(
        Array.filter(
          delivered,
          ([topic, level]) =>
            (topic === 'watering_reminder') !== (level === 'time-sensitive')
        )
      ).toEqual([])
    })
  })

  describe('recoverStrandedDeliveries', () => {
    const minutesAgo = (minutes: number) =>
      new Date(Date.now() - minutes * 60_000)

    it('requeues stranded messages and settles rows their delivery left behind', async () => {
      const row = (id: string) =>
        createPlantRow({ id, userId: 'user-1', status: 'queued' })
      const rows = {
        lost: row('lost'),
        slow: row('slow'),
        abandoned: row('abandoned'),
        legacy: row('legacy'),
      }
      let sweeps = 0

      await Effect.runPromise(
        recoverStrandedDeliveries.pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockMessageQueue({
                onRequeueStale: () => {
                  sweeps += 1
                  return 0
                },
              }),
              createMockNotificationRepository(Record.values(rows), {
                queuedAt: {
                  lost: minutesAgo(11),
                  slow: minutesAgo(1),
                  abandoned: minutesAgo(90),
                },
                deliveryClaims: { abandoned: 'msg-abandoned' },
              })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(sweeps).toBe(1)
      expect(rows.lost.status).toBe('pending')
      expect(rows.slow.status).toBe('queued')
      expect(rows.abandoned.status).toBe('failed')
      expect(rows.legacy.status).toBe('failed')
    })

    it('settles legacy rows before any stranded message is back on the queue', async () => {
      const legacy = createPlantRow({
        id: 'legacy',
        userId: 'user-1',
        status: 'queued',
      })
      const statusWhenRequeued: string[] = []

      await Effect.runPromise(
        recoverStrandedDeliveries.pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockMessageQueue({
                onRequeueStale: () => {
                  statusWhenRequeued.push(legacy.status)
                  return 1
                },
              }),
              createMockNotificationRepository([legacy])
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      // A worker can take a requeued message the moment it lands, so a
      // pre-fix row must already be unclaimable or a weeks-old reminder goes out.
      expect(statusWhenRequeued).not.toHaveLength(0)
      expect(Array.every(statusWhenRequeued, (s) => s === 'failed')).toBe(true)
    })

    it('requeues stale messages when the legacy drain fails', async () => {
      let sweeps = 0
      const drainFails = Layer.effect(
        MessageQueue,
        Effect.map(MessageQueue, (queue) => ({
          ...queue,
          drainLegacyTopicLists: Effect.fail(
            new QueueOperationError({ message: 'redis down', cause: null })
          ),
        }))
      ).pipe(
        Layer.provide(
          createMockMessageQueue({
            onRequeueStale: () => {
              sweeps += 1
              return 0
            },
          })
        )
      )

      const exit = await Effect.runPromiseExit(
        recoverStrandedDeliveries.pipe(
          Effect.provide(
            Layer.mergeAll(drainFails, createMockNotificationRepository([]))
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(sweeps).toBe(1)
      expect(Exit.isFailure(exit)).toBe(true)
    })

    it('leaves a message in flight for one minute where it is', async () => {
      const redis = createInMemoryRedisQueue([
        JSON.stringify(
          createTestQueueMessage({
            payload: {
              ...createTestQueueMessage().payload,
              notificationIds: [rowId('1')],
            },
          })
        ),
      ])
      vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000 - 60_000)
      await Effect.runPromise(redis.queue.dequeue)
      vi.restoreAllMocks()
      vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)

      await Effect.runPromise(
        recoverStrandedDeliveries.pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(MessageQueue, redis.queue),
              createMockNotificationRepository([])
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      ).finally(() => vi.restoreAllMocks())

      expect(redis.liveKeys()).toEqual([
        'lily:queue:notifications:in-flight',
        'lily:queue:notifications:in-flight:claimed-at',
      ])
    })

    it('hands back every readable row left on the per-topic lists and warns about each entry it cannot read', async () => {
      const ids = [rowId('1'), rowId('2'), rowId('3'), rowId('4')]
      const rows = Array.map(ids, (id) =>
        createPlantRow({ id, userId: 'user-1', status: 'queued' })
      )
      const entry = (n: number, topic: NotificationTopic, extra = []) =>
        JSON.stringify(
          createTestQueueMessage({
            id: `legacy-${n}`,
            topic,
            payload: {
              ...createTestQueueMessage().payload,
              notificationIds: [rowId(String(n + 1)), ...extra],
            },
          })
        )
      const redis = createInMemoryRedis({
        'lily:notifications:watering_reminder': [
          entry(0, 'watering_reminder'),
          entry(1, 'watering_reminder'),
        ],
        'lily:notifications:new_follower': [
          entry(2, 'new_follower', ['not-a-uuid'] as never),
        ],
        'lily:notifications:daily_tip:processing': [
          entry(3, 'daily_tip'),
          'not json',
        ],
      })
      const warnings: unknown[] = []
      const capture = Logger.make(({ logLevel, message }) => {
        if (logLevel === 'Warn') warnings.push(message)
      })

      await Effect.runPromise(
        recoverStrandedDeliveries.pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(MessageQueue, redis.queue),
              createMockNotificationRepository(rows, {
                queuedAt: Record.fromEntries(
                  Array.map(ids, (id) => [id, new Date(Date.now())])
                ),
              }),
              Logger.layer([capture])
            )
          )
        )
      )

      expect(redis.liveKeys()).toEqual([])
      expect(Array.map(rows, (r) => r.status)).toEqual([
        'pending',
        'pending',
        'pending',
        'pending',
      ])
      expect(warnings).toEqual(
        expect.arrayContaining([
          [
            '[notification-recovery] Legacy entry has unreadable notification ids',
            expect.objectContaining({
              messageId: 'legacy-2',
              malformedIds: ['not-a-uuid'],
            }),
          ],
          [
            '[notification-recovery] Legacy entry has unreadable notification ids',
            { messageId: undefined, malformedIds: [], entry: 'not json' },
          ],
        ])
      )
    })
  })
})
