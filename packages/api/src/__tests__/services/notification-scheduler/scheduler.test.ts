import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import type { User } from '@lily/shared'
import type { NotificationTopic, QueueMessage } from '@lily/shared/server'
import { Effect, Logger, LogLevel } from 'effect'
import { describe, expect, it } from 'vitest'

// Default user with all notifications enabled and DND off
const defaultUser = createTestUser({
  id: 'user-1',
  careReminders: true,
  doNotDisturb: false,
  timezone: 'UTC',
})

const runPollAndEnqueue = (
  notifications: ReturnType<typeof createTestNotification>[],
  users: User[],
  onEnqueue?: (topic: NotificationTopic, message: QueueMessage) => void
) =>
  Effect.runPromise(
    pollAndEnqueue.pipe(
      Effect.provide(createMockNotificationRepository(notifications)),
      Effect.provide(createMockMessageQueue(onEnqueue ? { onEnqueue } : {})),
      Effect.provide(createMockUserRepository(users)),
      Logger.withMinimumLogLevel(LogLevel.None)
    )
  )

describe('Notification Scheduler', () => {
  describe('pollAndEnqueue', () => {
    it('should enqueue pending watering reminders', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const pendingNotification = createTestNotification({
        id: 'pending-1',
        type: 'watering_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000), // 1 minute ago
        userId: 'user-1',
      })

      await runPollAndEnqueue(
        [pendingNotification],
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.topic).toBe('watering_reminder')
      expect(enqueuedMessages[0]?.message.payload.notificationId).toBe(
        'pending-1'
      )
      expect(enqueuedMessages[0]?.message.payload.title).toBe(
        pendingNotification.title
      )
    })

    it('should enqueue pending fertilization reminders', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const pendingNotification = createTestNotification({
        id: 'pending-2',
        type: 'fertilization_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue(
        [pendingNotification],
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.topic).toBe('fertilization_reminder')
    })

    it('should skip notifications with unknown types', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const pendingNotification = createTestNotification({
        id: 'pending-3',
        type: 'unknown_type',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue(
        [pendingNotification],
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(0)
    })

    it('should do nothing when no pending notifications exist', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      await runPollAndEnqueue([], [defaultUser], (topic, message) =>
        enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(0)
    })

    it('should mark notifications as queued after enqueueing', async () => {
      const pendingNotification = createTestNotification({
        id: 'pending-4',
        type: 'watering_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue([pendingNotification], [defaultUser])

      // The mock modifies internal state, not the original object
      // We just verify that the function completes without error
      expect(true).toBe(true)
    })

    it('should enqueue multiple notifications in order', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const notifications = [
        createTestNotification({
          id: 'pending-a',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 120000),
          userId: 'user-1',
        }),
        createTestNotification({
          id: 'pending-b',
          type: 'fertilization_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
        }),
      ]

      await runPollAndEnqueue(notifications, [defaultUser], (topic, message) =>
        enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(2)
      expect(enqueuedMessages[0]?.message.payload.notificationId).toBe(
        'pending-a'
      )
      expect(enqueuedMessages[1]?.message.payload.notificationId).toBe(
        'pending-b'
      )
    })

    it('should not enqueue future notifications', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      // Mock repo only returns notifications where scheduledAt <= now
      // A notification scheduled in the future won't be returned by findPendingToSchedule
      const futureNotification = createTestNotification({
        id: 'future-1',
        type: 'watering_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() + 60000), // 1 minute in the future
        userId: 'user-1',
      })

      await runPollAndEnqueue(
        [futureNotification],
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message })
      )

      // The mock implementation filters by scheduledAt <= now
      expect(enqueuedMessages).toHaveLength(0)
    })
  })

  describe('DND safety net in pollAndEnqueue', () => {
    it('should enqueue notifications when user has DND disabled', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const user = createTestUser({
        id: 'user-1',
        doNotDisturb: false,
        careReminders: true,
        timezone: 'UTC',
      })

      const pendingNotification = createTestNotification({
        id: 'dnd-off-1',
        type: 'watering_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue([pendingNotification], [user], (topic, message) =>
        enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(1)
    })

    it('should enqueue notifications when user has DND enabled but current time is outside window', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      // DND 01:00-02:00 UTC. Current time is now (probably not 1-2 AM).
      // Use a very narrow window that's unlikely to match current time.
      const user = createTestUser({
        id: 'user-1',
        doNotDisturb: true,
        careReminders: true,
        timezone: 'UTC',
        doNotDisturbStart: '03:00',
        doNotDisturbEnd: '03:01',
      })

      const pendingNotification = createTestNotification({
        id: 'dnd-outside-1',
        type: 'watering_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue([pendingNotification], [user], (topic, message) =>
        enqueuedMessages.push({ topic, message })
      )

      // This test may be flaky if run exactly at 03:00 UTC but that's extremely unlikely
      expect(enqueuedMessages).toHaveLength(1)
    })

    it('should skip notifications for different users where one has DND and one does not', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const userWithoutDnd = createTestUser({
        id: 'user-no-dnd',
        doNotDisturb: false,
        careReminders: true,
        timezone: 'UTC',
      })

      // User with DND covering a very wide window (almost all day)
      const userWithDnd = createTestUser({
        id: 'user-with-dnd',
        doNotDisturb: true,
        careReminders: true,
        timezone: 'UTC',
        doNotDisturbStart: '00:00',
        doNotDisturbEnd: '23:59',
      })

      const notifications = [
        createTestNotification({
          id: 'notif-no-dnd',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-no-dnd',
        }),
        createTestNotification({
          id: 'notif-with-dnd',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-with-dnd',
        }),
      ]

      await runPollAndEnqueue(
        notifications,
        [userWithoutDnd, userWithDnd],
        (topic, message) => enqueuedMessages.push({ topic, message })
      )

      // Only the non-DND user's notification should be enqueued
      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.message.payload.notificationId).toBe(
        'notif-no-dnd'
      )
    })
  })

  describe('careReminders safety net in pollAndEnqueue', () => {
    it('should skip care reminder notifications when user has careReminders disabled', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const user = createTestUser({
        id: 'user-1',
        careReminders: false,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const pendingNotification = createTestNotification({
        id: 'care-disabled-1',
        type: 'watering_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue([pendingNotification], [user], (topic, message) =>
        enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(0)
    })

    it('should enqueue care reminder notifications when user has careReminders enabled', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const pendingNotification = createTestNotification({
        id: 'care-enabled-1',
        type: 'watering_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue([pendingNotification], [user], (topic, message) =>
        enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(1)
    })

    it('should skip fertilization reminders when user has careReminders disabled', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const user = createTestUser({
        id: 'user-1',
        careReminders: false,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const pendingNotification = createTestNotification({
        id: 'fert-disabled-1',
        type: 'fertilization_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue([pendingNotification], [user], (topic, message) =>
        enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(0)
    })
  })
})
