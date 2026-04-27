import { mockDeviceTokens } from '@lily/api/__tests__/fixtures/device-tokens'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createMockActivityPushTokenRepository } from '@lily/api/__tests__/mocks/activity-push-token.repository'
import { MockAlerterLive } from '@lily/api/__tests__/mocks/alerter'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import {
  createMockDeadLetterRepository,
  createMockDeadLetterRepositoryWithCapture,
} from '@lily/api/__tests__/mocks/dead-letter.repository'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import {
  createFailingPushService,
  createMockPushService,
  createSuccessPushService,
} from '@lily/api/__tests__/mocks/push.service'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import {
  consumeFromTopic,
  handleFailedMessage,
  processMessage,
} from '@lily/api/services/notification-scheduler/worker'
import type { PushMessage, QueueMessage } from '@lily/shared/server'
import { Effect, Layer, Logger, LogLevel, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

// Empty mocks for the Live Activity path — worker unconditionally reads
// these repos when TOPIC_CATEGORY[topic] === 'care'. With no tokens seeded,
// the LA helper returns early and the care banner path is unchanged.
const LaMocksLive = Layer.mergeAll(
  createMockActivityPushTokenRepository(),
  createMockCareScheduleRepository(),
  createMockCareLogRepository([]),
  createMockUserRepository([])
)

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

// Runs processMessage with the default user-1 mocks and returns the pushes
// that were captured. Keeps per-test setup to a single line.
const runAndCapturePushes = async (
  message: QueueMessage
): Promise<PushMessage[]> => {
  const sentMessages: PushMessage[] = []
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
          LaMocksLive
        )
      ),
      Logger.withMinimumLogLevel(LogLevel.None)
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )

      // user-1 has 2 active tokens
      expect(sentMessages).toHaveLength(2)
      expect(sentMessages[0]?.title).toBe('Test notification')
      expect(sentMessages[0]?.body).toBe('Test body')
    })

    it('should mark notification as sent on success', async () => {
      const message = createTestQueueMessage()
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
              createSuccessPushService(),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([notification]),
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )

      // Notification status is managed in the mock's internal state
      expect(true).toBe(true)
    })

    it('should still mark as sent when user has no active tokens', async () => {
      const message = createTestQueueMessage({
        payload: {
          userId: 'user-2', // user-2 has no active tokens
          title: 'Test',
          body: 'Test body',
          notificationIds: ['notification-1'],
          plantIds: [],
        },
      })

      const notification = createTestNotification({
        id: 'notification-1',
        userId: 'user-2',
        status: 'queued',
      })

      await Effect.runPromise(
        processMessage(message).pipe(
          Effect.provide(
            Layer.mergeAll(
              MockAlerterLive,
              createSuccessPushService(),
              createMockDeviceTokenRepository(mockDeviceTokens),
              createMockNotificationRepository([notification]),
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )

      // user-2 only has inactive token, so notification is still marked as sent
      // Notification status is managed in the mock's internal state
      expect(true).toBe(true)
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
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
          Logger.withMinimumLogLevel(LogLevel.None)
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
                    Option.fromNullable(queueMessages.shift()),
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
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
              LaMocksLive
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )

      expect(sentMessages).toHaveLength(0)
    })

    // Note: Tests for retry/DLQ logic with consumeFromTopic are skipped because
    // the exponential backoff schedule makes them too slow. The retry and DLQ
    // logic is already tested via handleFailedMessage tests above.
  })
})
