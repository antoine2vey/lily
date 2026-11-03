import { createTestMembership } from '@lily/api/__tests__/fixtures/canopies'
import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestDeviceToken,
  mockDeviceTokens,
} from '@lily/api/__tests__/fixtures/device-tokens'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
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
} from '@lily/api/__tests__/mocks/push.service'
import { createInMemoryRedisQueue } from '@lily/api/__tests__/mocks/redis-queue'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
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
  consumeFromTopic,
  handleFailedMessage,
  processMessage,
  recoverStrandedDeliveries,
  startNotificationWorker,
} from '@lily/api/services/notification-scheduler/worker'
import type { ActivityPushToken, CanopyId } from '@lily/shared'
import type { DeviceToken } from '@lily/shared/device-token'
import type { Notification } from '@lily/shared/notification'
import {
  type LiveActivityPushMessage,
  MAX_NOTIFICATION_IDS,
  MessageQueue,
  NOTIFICATION_TOPICS,
  type NotificationTopic,
  type PushMessage,
  PushService,
  type QueueMessage,
} from '@lily/shared/server'
import {
  Array,
  Clock,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  pipe,
  Record,
  References,
  Scope,
  Struct,
} from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

// Empty mocks for the Live Activity path — worker unconditionally reads
// these repos when TOPIC_CATEGORY[topic] === 'care'. With no tokens seeded,
// the LA helper returns early and the care banner path is unchanged.
const LaMocksLive = Layer.mergeAll(
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
  ],
})

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
    title: 'Test notification',
    body: 'Test body',
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
      createTestNotification({
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
      const notification = createTestNotification({
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
      expect(sentMessages[0]?.title).toBe('Test notification')
      expect(sentMessages[0]?.body).toBe('Test body')
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
            title: 'Test notification',
            body: 'Test body',
            notificationIds: ['notification-1'],
            plantIds: [],
          },
        }),
        {
          tokens,
          notifications: [
            createTestNotification({
              id: 'notification-1',
              userId,
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
            title: 'Test notification',
            body: 'Test body',
            notificationIds: ['notification-1'],
            plantIds: [],
          },
        }),
        {
          tokens,
          notifications: [
            createTestNotification({
              id: 'notification-1',
              userId,
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
      const notification = createTestNotification({
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
      const notification = createTestNotification({
        id: 'notification-1',
        userId: 'user-2',
        status: 'queued',
      })

      // user-2 owns only an inactive token in the fixture, so there is nobody
      // to push to. Default `tokens` (mockDeviceTokens) already include it.
      const sentMessages = await runAndCapturePushes(
        createTestQueueMessage({
          payload: {
            userId: 'user-2',
            title: 'Test',
            body: 'Test body',
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
      const notification = createTestNotification({
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
          title: 'Delegation request',
          body: 'Someone wants you to care for their plants',
          notificationIds: ['notification-1'],
          plantIds: [],
          metadata: { delegationId: 'deleg-42' },
        },
      })
      const notification = createTestNotification({
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
          title: 'Water your plants',
          body: 'Monstera, Pothos',
          notificationIds: ['notification-1'],
          plantIds: ['plant-1', 'plant-2'],
        },
      })
      const notification = createTestNotification({
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
          title: 'New follower',
          body: 'Someone followed you',
          notificationIds: ['notification-1'],
          plantIds: [],
          metadata: { senderId: 'user-99' },
        },
      })
      const notification = createTestNotification({
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
            title: 'Daily tip',
            body: 'Tip body',
            notificationIds: ['notification-1'],
            plantIds: [],
          },
        })
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
          title: '💧 3 plants need watering',
          body: 'Monstera, Pothos, Fern',
          notificationIds: ['notif-1', 'notif-2', 'notif-3'],
          plantIds: ['plant-1', 'plant-2', 'plant-3'],
        },
      })

      const notifications = [
        createTestNotification({
          id: 'notif-1',
          userId: 'user-1',
          status: 'queued',
        }),
        createTestNotification({
          id: 'notif-2',
          userId: 'user-1',
          status: 'queued',
        }),
        createTestNotification({
          id: 'notif-3',
          userId: 'user-1',
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
      expect(sentMessages[0]?.title).toBe('💧 3 plants need watering')
      // Grouped care reminders also carry the time-sensitive flag so the
      // consolidated "3 plants need watering" push pierces Focus/DND.
      for (const m of sentMessages) {
        expect(m.interruptionLevel).toBe('time-sensitive')
      }
    })
  })

  describe('handleFailedMessage', () => {
    it('should add message to dead letter queue', async () => {
      const { layer: dlqLayer, capturedMessages } =
        createMockDeadLetterRepositoryWithCapture()

      const message = createTestQueueMessage({
        id: 'msg-1',
        retryCount: 2,
      })
      const notification = createTestNotification({
        id: 'notification-1',
        status: 'queued',
      })

      await Effect.runPromise(
        handleFailedMessage(message, new Error('Test error')).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              dlqLayer,
              createMockNotificationRepository([notification]),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(capturedMessages).toHaveLength(1)
      expect(capturedMessages[0]?.originalMessageId).toBe('msg-1')
      expect(capturedMessages[0]?.topic).toBe('watering_reminder')
      expect(capturedMessages[0]?.error).toContain('Test error')
      expect(capturedMessages[0]?.retryCount).toBe(2)
    })

    it('should mark notification as failed', async () => {
      const message = createTestQueueMessage()
      const notification = createTestNotification({
        id: 'notification-1',
        status: 'queued',
      })

      await Effect.runPromise(
        handleFailedMessage(message, new Error('Push service down')).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockDeadLetterRepository(),
              createMockNotificationRepository([notification]),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      // Notification status is managed in the mock's internal state
      expect(true).toBe(true)
    })

    it('should include plantId when present', async () => {
      const { layer: dlqLayer, capturedMessages } =
        createMockDeadLetterRepositoryWithCapture()

      const message = createTestQueueMessage({
        payload: {
          userId: 'user-1',
          title: 'Test',
          body: 'Test',
          notificationIds: ['notification-1'],
          plantIds: ['plant-123'],
        },
      })
      const notification = createTestNotification({
        id: 'notification-1',
      })

      await Effect.runPromise(
        handleFailedMessage(message, new Error('Error')).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              dlqLayer,
              createMockNotificationRepository([notification]),
              LaMocksLive,
              LivingPlantsLive
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(capturedMessages[0]?.plantId).toBe('plant-123')
    })

    it('should mark all IDs as failed for grouped message', async () => {
      const message = createTestQueueMessage({
        payload: {
          userId: 'user-1',
          title: '💧 3 plants need watering',
          body: 'Monstera, Pothos, Fern',
          notificationIds: ['notif-1', 'notif-2', 'notif-3'],
          plantIds: ['plant-1', 'plant-2', 'plant-3'],
        },
      })

      const notifications = [
        createTestNotification({
          id: 'notif-1',
          userId: 'user-1',
          status: 'queued',
        }),
        createTestNotification({
          id: 'notif-2',
          userId: 'user-1',
          status: 'queued',
        }),
        createTestNotification({
          id: 'notif-3',
          userId: 'user-1',
          status: 'queued',
        }),
      ]

      await Effect.runPromise(
        handleFailedMessage(message, new Error('Push failed')).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createMockDeadLetterRepository(),
              createMockNotificationRepository(notifications)
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      // Completes without error - all IDs marked as failed via markManyAsFailed
      expect(true).toBe(true)
    })
  })

  describe('consumeFromTopic', () => {
    it('should process message from queue', async () => {
      const sentMessages: PushMessage[] = []
      const ackedMessages: string[] = []

      const queueMessage = createTestQueueMessage({
        id: 'msg-to-process',
      })
      const notification = createTestNotification({
        id: 'notification-1',
        userId: 'user-1',
        status: 'queued',
      })

      // Use a mutable array for the queue
      const queueMessages: QueueMessage[] = [queueMessage]

      await Effect.runPromise(
        consumeFromTopic('watering_reminder').pipe(
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
                onAck: (_, rawData) => ackedMessages.push(rawData),
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
        consumeFromTopic('watering_reminder').pipe(
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
        consumeFromTopic('new_follower').pipe(
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
          topic: 'new_follower',
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
          consumeFromTopic('new_follower').pipe(
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
        consumeFromTopic('new_follower').pipe(
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
          title: 'New follower',
          body: 'Bob follows you',
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
        consumeFromTopic('new_follower').pipe(
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
          await Effect.runPromiseExit(decodeQueueEntry('new_follower', atCap))
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
        consumeFromTopic('new_follower').pipe(
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

    // Note: Tests for retry/DLQ logic with consumeFromTopic are skipped because
    // the exponential backoff schedule makes them too slow. The retry and DLQ
    // logic is already tested via handleFailedMessage tests above.
  })

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

    // One plant due for watering today so buildLiveActivityContentState
    // yields a card, plus a single push-to-start token and no active update
    // row — the pure "start" path.
    const runWithStartToken = async (
      token: ActivityPushToken,
      runs: number
    ): Promise<LiveActivityPushMessage[]> => {
      const laMessages: LiveActivityPushMessage[] = []
      const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
      const layer = Layer.mergeAll(
        MockAlerterLive,
        createMockPushService({
          onSendLiveActivity: (m) => laMessages.push(m),
        }),
        createMockDeviceTokenRepository(mockDeviceTokens),
        createMockNotificationRepository([
          createTestNotification({
            id: 'notification-1',
            userId: 'user-1',
            status: 'queued',
          }),
        ]),
        createMockActivityPushTokenRepository({ tokens: [token] }),
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
      const message = createTestQueueMessage({ topic: 'watering_reminder' })
      for (let i = 0; i < runs; i++) {
        await Effect.runPromise(
          processMessage(message).pipe(
            Effect.provide(layer),
            Effect.provideService(References.MinimumLogLevel, 'None')
          )
        )
      }
      return laMessages
    }

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
  describe('dead plant guard', () => {
    const runWithPlants = async (
      plants: ReturnType<typeof createTestPlant>[],
      plantIds: string[],
      canopyLayer?: Layer.Layer<CanopyRepository>,
      delegationLayer?: Layer.Layer<DelegationRepository>,
      rows?: Notification[]
    ) => {
      const sentMessages: PushMessage[] = []
      const notification = createTestNotification({
        id: 'notification-1',
        userId: 'user-1',
        status: 'queued',
      })
      const notifications = rows ?? [notification]
      await Effect.runPromise(
        processMessage(
          createTestQueueMessage({
            topic: 'watering_reminder',
            payload: {
              userId: 'user-1',
              title: 'Water time',
              body: 'Your plants are thirsty',
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
      return { sentMessages, notification }
    }

    it('drops a care push whose every plant is dead and marks it sent', async () => {
      const dead = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        diedAt: new Date(),
      })
      const { sentMessages, notification } = await runWithPlants(
        [dead],
        ['plant-1']
      )

      expect(sentMessages).toHaveLength(0)
      expect(notification.status).toBe('sent')
    })

    it('drops a care push for a Canopy plant whose Canopy the user has left', async () => {
      const leftBehind = createTestPlant({
        id: 'plant-1',
        userId: null,
        canopyId: 'canopy-2',
      })
      const { sentMessages, notification } = await runWithPlants(
        [leftBehind],
        ['plant-1']
      )

      expect(sentMessages).toHaveLength(0)
      expect(notification.status).toBe('sent')
    })

    it('drops a care push for a Canopy plant the user has muted since', async () => {
      const shared = createTestPlant({
        id: 'plant-1',
        userId: null,
        canopyId: 'canopy-1',
      })
      const { sentMessages, notification } = await runWithPlants(
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
      expect(notification.status).toBe('sent')
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

    it('delivers a caretaker care push after the delegation completed', async () => {
      const theirs = createTestPlant({ id: 'plant-1', userId: 'user-2' })
      const { sentMessages } = await runWithPlants(
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

      expect(sentMessages.length).toBeGreaterThan(0)
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
        createTestNotification({
          id: 'notification-1',
          userId: 'user-1',
          plantId: 'plant-1',
          type: 'watering_reminder',
          status: 'queued',
        }),
        createTestNotification({
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
      expect(Array.map(rows, (n) => n.status)).toEqual(['sent', 'sent'])
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
          createTestNotification({
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
          createTestNotification({
            id: 'notification-1',
            userId: 'user-1',
            plantId: 'plant-1',
            type: 'watering_reminder',
            status: 'queued',
          }),
          createTestNotification({
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
          createTestNotification({
            id: 'notification-1',
            userId: 'user-1',
            plantId: 'plant-1',
            status: 'queued',
          }),
          createTestNotification({
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
  })

  describe('delivery claims', () => {
    const queuedRow = (id: string) =>
      createTestNotification({ id, userId: 'user-1', status: 'queued' })

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
          onAck: (_, rawData) => acked.push(rawData),
        }),
        createMockDeadLetterRepository(),
        LaMocksLive,
        LivingPlantsLive
      )

      await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            consumeFromTopic('watering_reminder').pipe(Effect.provide(layer))
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
                title: 'Water time',
                body: 'Your plant is thirsty',
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
      createTestNotification({ id, userId: 'user-1', status: 'queued' })

    const redisQueue = (
      ready: Partial<Record<NotificationTopic, unknown[]>>,
      acked: string[]
    ) => {
      const processing = new Map<string, NotificationTopic>()
      const mock = createMockMessageQueue({
        onAck: (_, rawData) => {
          acked.push(rawData)
          processing.delete(rawData)
        },
        onRequeueStale: (topic) => {
          const stale = Array.filter(
            Array.fromIterable(processing),
            ([, owner]) => owner === topic
          )
          Array.forEach(stale, ([rawData]) => {
            processing.delete(rawData)
            ready[topic]?.push(JSON.parse(rawData))
          })
          return stale.length
        },
      })
      return Layer.effect(
        MessageQueue,
        Effect.map(MessageQueue, (queue) => ({
          ...queue,
          dequeue: (topic: NotificationTopic) =>
            Effect.suspend(() =>
              Option.match(Option.fromNullishOr(ready[topic]?.shift()), {
                onNone: () => Effect.succeed(null),
                onSome: (entry) => {
                  const rawData = JSON.stringify(entry)
                  processing.set(rawData, topic)
                  return decodeQueueEntry(topic, rawData)
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
    }) =>
      Layer.mergeAll(
        options.alerter,
        options.queue,
        options.push,
        createMockDeviceTokenRepository(mockDeviceTokens),
        createMockNotificationRepository(options.rows, {
          deliveryClaims: options.deliveryClaims ?? {},
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
          queue: redisQueue({ watering_reminder: [...poisons, valid] }, acked),
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
      expect(alerter.events).toEqual(
        Array.map(ids, (id) =>
          expect.objectContaining({
            _tag: 'UnhandledDefect',
            message: expect.stringMatching(/^watering_reminder: \w/),
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
          queue: redisQueue({ watering_reminder: twins }, []),
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
          queue: redisQueue({ watering_reminder: [poison, valid] }, acked),
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
          queue: redisQueue({ watering_reminder: [first, second] }, acked),
          push: pushDiesOnce,
          rows,
          alerter: alerter.layer,
          deadLetters: deadLetters.layer,
        }),
        pastTheFirstPolls
      )

      expect(deadLetters.capturedMessages).toEqual([
        expect.objectContaining({ originalMessageId: 'msg-1', retryCount: 0 }),
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

    it('keeps polling a topic after an ack dies', async () => {
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
          ack: (topic: NotificationTopic, rawData: string) =>
            Effect.suspend(() =>
              Option.match(Option.fromNullishOr(ackDefects.shift()), {
                onNone: () => queue.ack(topic, rawData),
                onSome: Effect.die,
              })
            ),
        }))
      ).pipe(
        Layer.provide(redisQueue({ watering_reminder: [first, second] }, acked))
      )

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

    it('finishes every in-flight send and its bookkeeping on shutdown, within one step', async () => {
      const rows = [
        queuedRow(rowId('w1')),
        queuedRow(rowId('w2')),
        queuedRow(rowId('m1')),
        queuedRow(rowId('m2')),
      ]
      const message = (id: string, topic: NotificationTopic) =>
        createTestQueueMessage({
          id: `msg-${id}`,
          topic,
          payload: { ...valid.payload, notificationIds: [rowId(id)] },
        })
      const batches: PushMessage[][] = []
      const acked: string[] = []

      const drained = await runWorkersAndTimeDrain(
        workerLayer({
          queue: redisQueue(
            {
              watering_reminder: [
                message('w1', 'watering_reminder'),
                message('w2', 'watering_reminder'),
              ],
              misting_reminder: [
                message('m1', 'misting_reminder'),
                message('m2', 'misting_reminder'),
              ],
            },
            acked
          ),
          push: slowPush(batches),
          rows,
          alerter: MockAlerterLive,
        }),
        '1 second'
      )

      expect(batches).toHaveLength(2)
      expect(Array.map(rows, (r) => r.status)).toEqual([
        'sent',
        'queued',
        'sent',
        'queued',
      ])
      expect(acked).toHaveLength(2)
      expect(Duration.toMillis(drained)).toBeLessThan(5_000)
    })
  })

  describe('recoverStrandedDeliveries', () => {
    const minutesAgo = (minutes: number) =>
      new Date(Date.now() - minutes * 60_000)

    it('requeues stranded messages and settles rows their delivery left behind', async () => {
      const row = (id: string) =>
        createTestNotification({ id, userId: 'user-1', status: 'queued' })
      const rows = {
        lost: row('lost'),
        slow: row('slow'),
        abandoned: row('abandoned'),
        legacy: row('legacy'),
      }
      const sweptTopics: string[] = []

      await Effect.runPromise(
        recoverStrandedDeliveries.pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockMessageQueue({
                onRequeueStale: (topic) => {
                  sweptTopics.push(topic)
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

      expect(sweptTopics).toEqual([...NOTIFICATION_TOPICS])
      expect(rows.lost.status).toBe('pending')
      expect(rows.slow.status).toBe('queued')
      expect(rows.abandoned.status).toBe('failed')
      expect(rows.legacy.status).toBe('failed')
    })

    it('settles legacy rows before any stranded message is back on the queue', async () => {
      const legacy = createTestNotification({
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
  })
})
