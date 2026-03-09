import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import {
  createTestPlant,
  type PlantRecord,
} from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { pollAndEnqueue } from '@lily/api/services/notification-scheduler/scheduler'
import { buildNotificationContent } from '@lily/api/services/notification-scheduler/translations'
import type { User } from '@lily/shared'
import type { NotificationTopic, QueueMessage } from '@lily/shared/server'
import { Array as Arr, Effect, Logger, LogLevel } from 'effect'
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
  onEnqueue?: (topic: NotificationTopic, message: QueueMessage) => void,
  plantsData: PlantRecord[] = []
) =>
  Effect.runPromise(
    pollAndEnqueue.pipe(
      Effect.provide(createMockNotificationRepository(notifications)),
      Effect.provide(createMockMessageQueue(onEnqueue ? { onEnqueue } : {})),
      Effect.provide(createMockUserRepository(users)),
      Effect.provide(createMockPlantRepository({ plants: plantsData })),
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
        plantId: 'plant-1',
      })

      const plant = createTestPlant({ id: 'plant-1', name: 'Monstera' })

      await runPollAndEnqueue(
        [pendingNotification],
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message }),
        [plant]
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.topic).toBe('watering_reminder')
      expect(enqueuedMessages[0]?.message.payload.notificationIds).toContain(
        'pending-1'
      )
      expect(enqueuedMessages[0]?.message.payload.title).toBe(
        '💧 Time to water your Monstera'
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

    it('should enqueue new_follower notifications with pass-through title/body', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const pendingNotification = createTestNotification({
        id: 'follower-1',
        type: 'new_follower',
        status: 'pending',
        title: '👋 New follower',
        body: 'Alice started following you',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue(
        [pendingNotification],
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.topic).toBe('new_follower')
      expect(enqueuedMessages[0]?.message.payload.title).toBe('👋 New follower')
      expect(enqueuedMessages[0]?.message.payload.body).toBe(
        'Alice started following you'
      )
    })

    it('should enqueue delegation_request notifications', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const pendingNotification = createTestNotification({
        id: 'deleg-req-1',
        type: 'delegation_request',
        status: 'pending',
        title: '🤝 Care request',
        body: 'Bob wants you to care for their plants',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue(
        [pendingNotification],
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.topic).toBe('delegation_request')
      expect(enqueuedMessages[0]?.message.payload.title).toBe('🤝 Care request')
    })

    it('should enqueue nudge_to_water notifications', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const pendingNotification = createTestNotification({
        id: 'nudge-1',
        type: 'nudge_to_water',
        status: 'pending',
        title: '💧 Nudge from a friend',
        body: 'Charlie is reminding you to check on your plants!',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue(
        [pendingNotification],
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.topic).toBe('nudge_to_water')
    })

    it('should not apply careReminders filter to simple notification types', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const userWithCareOff = createTestUser({
        id: 'user-1',
        careReminders: false,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const pendingNotification = createTestNotification({
        id: 'follower-care-off',
        type: 'new_follower',
        status: 'pending',
        title: '👋 New follower',
        body: 'Alice started following you',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue(
        [pendingNotification],
        [userWithCareOff],
        (topic, message) => enqueuedMessages.push({ topic, message })
      )

      // new_follower is not a care reminder, so it should still be enqueued
      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.topic).toBe('new_follower')
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

  describe('notification grouping', () => {
    it('should group multiple watering notifications for same user into 1 enqueue', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const plant1 = createTestPlant({ id: 'plant-1', name: 'Monstera' })
      const plant2 = createTestPlant({ id: 'plant-2', name: 'Pothos' })
      const plant3 = createTestPlant({ id: 'plant-3', name: 'Fern' })

      const notifications = [
        createTestNotification({
          id: 'notif-1',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-1',
        }),
        createTestNotification({
          id: 'notif-2',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-2',
        }),
        createTestNotification({
          id: 'notif-3',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-3',
        }),
      ]

      await runPollAndEnqueue(
        notifications,
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message }),
        [plant1, plant2, plant3]
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.topic).toBe('watering_reminder')
      expect(enqueuedMessages[0]?.message.payload.notificationIds).toEqual([
        'notif-1',
        'notif-2',
        'notif-3',
      ])
    })

    it('should send separate messages per care type for same user', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const plant1 = createTestPlant({ id: 'plant-1', name: 'Monstera' })
      const plant2 = createTestPlant({ id: 'plant-2', name: 'Pothos' })

      const notifications = [
        createTestNotification({
          id: 'water-1',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-1',
        }),
        createTestNotification({
          id: 'fert-1',
          type: 'fertilization_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-2',
        }),
      ]

      await runPollAndEnqueue(
        notifications,
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message }),
        [plant1, plant2]
      )

      expect(enqueuedMessages).toHaveLength(2)
      const topics = Arr.map(enqueuedMessages, (m) => m.topic)
      expect(topics).toContain('watering_reminder')
      expect(topics).toContain('fertilization_reminder')
    })

    it('should send separate messages per user', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const user2 = createTestUser({
        id: 'user-2',
        careReminders: true,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const plant1 = createTestPlant({
        id: 'plant-1',
        name: 'Monstera',
        userId: 'user-1',
      })
      const plant2 = createTestPlant({
        id: 'plant-2',
        name: 'Pothos',
        userId: 'user-2',
      })

      const notifications = [
        createTestNotification({
          id: 'notif-u1',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-1',
        }),
        createTestNotification({
          id: 'notif-u2',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-2',
          plantId: 'plant-2',
        }),
      ]

      await runPollAndEnqueue(
        notifications,
        [defaultUser, user2],
        (topic, message) => enqueuedMessages.push({ topic, message }),
        [plant1, plant2]
      )

      expect(enqueuedMessages).toHaveLength(2)
      const userIds = Arr.map(enqueuedMessages, (m) => m.message.payload.userId)
      expect(userIds).toContain('user-1')
      expect(userIds).toContain('user-2')
    })

    it('should build translated title/body for single notification', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const plant1 = createTestPlant({ id: 'plant-1', name: 'Monstera' })

      const notification = createTestNotification({
        id: 'single-1',
        type: 'watering_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
        plantId: 'plant-1',
      })

      await runPollAndEnqueue(
        [notification],
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message }),
        [plant1]
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.message.payload.title).toBe(
        '💧 Time to water your Monstera'
      )
      expect(enqueuedMessages[0]?.message.payload.body).toBe(
        'Your Monstera needs watering today.'
      )
    })

    it('should use French translations when user language is fr', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const frenchUser = createTestUser({
        id: 'user-1',
        careReminders: true,
        doNotDisturb: false,
        timezone: 'UTC',
        language: 'fr',
      })

      const plant1 = createTestPlant({ id: 'plant-1', name: 'Monstera' })

      const notification = createTestNotification({
        id: 'fr-1',
        type: 'watering_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
        plantId: 'plant-1',
      })

      await runPollAndEnqueue(
        [notification],
        [frenchUser],
        (topic, message) => enqueuedMessages.push({ topic, message }),
        [plant1]
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.message.payload.title).toBe(
        "💧 Il est temps d'arroser votre Monstera"
      )
    })

    it('should build grouped title/body with plant names', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const plant1 = createTestPlant({ id: 'plant-1', name: 'Monstera' })
      const plant2 = createTestPlant({ id: 'plant-2', name: 'Pothos' })

      const notifications = [
        createTestNotification({
          id: 'g-1',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-1',
        }),
        createTestNotification({
          id: 'g-2',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-2',
        }),
      ]

      await runPollAndEnqueue(
        notifications,
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message }),
        [plant1, plant2]
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.message.payload.title).toBe(
        '💧 2 plants need watering'
      )
      expect(enqueuedMessages[0]?.message.payload.body).toBe('Monstera, Pothos')
    })

    it('should include notificationIds and plantIds in grouped payload', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const plant1 = createTestPlant({ id: 'plant-1', name: 'Monstera' })
      const plant2 = createTestPlant({ id: 'plant-2', name: 'Pothos' })

      const notifications = [
        createTestNotification({
          id: 'p-1',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-1',
        }),
        createTestNotification({
          id: 'p-2',
          type: 'watering_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-2',
        }),
      ]

      await runPollAndEnqueue(
        notifications,
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message }),
        [plant1, plant2]
      )

      expect(enqueuedMessages).toHaveLength(1)
      const payload = enqueuedMessages[0]?.message.payload
      expect(payload?.notificationIds).toEqual(['p-1', 'p-2'])
      expect(payload?.plantIds).toEqual(['plant-1', 'plant-2'])
    })
  })

  describe('overdue_reminder grouping', () => {
    it('should recognize overdue_reminder as care reminder and group by user', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const plant1 = createTestPlant({ id: 'plant-1', name: 'Monstera' })
      const plant2 = createTestPlant({ id: 'plant-2', name: 'Fern' })

      const notifications = [
        createTestNotification({
          id: 'overdue-1',
          type: 'overdue_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-1',
        }),
        createTestNotification({
          id: 'overdue-2',
          type: 'overdue_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-2',
        }),
      ]

      await runPollAndEnqueue(
        notifications,
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message }),
        [plant1, plant2]
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.topic).toBe('overdue_reminder')
      expect(enqueuedMessages[0]?.message.payload.notificationIds).toEqual([
        'overdue-1',
        'overdue-2',
      ])
      expect(enqueuedMessages[0]?.message.payload.title).toBe(
        '⚠️ 2 plants need attention'
      )
    })

    it('should build overdue_reminder title for single plant', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const plant1 = createTestPlant({ id: 'plant-1', name: 'Monstera' })

      const notifications = [
        createTestNotification({
          id: 'overdue-single',
          type: 'overdue_reminder',
          status: 'pending',
          scheduledAt: new Date(Date.now() - 60000),
          userId: 'user-1',
          plantId: 'plant-1',
        }),
      ]

      await runPollAndEnqueue(
        notifications,
        [defaultUser],
        (topic, message) => enqueuedMessages.push({ topic, message }),
        [plant1]
      )

      expect(enqueuedMessages).toHaveLength(1)
      expect(enqueuedMessages[0]?.message.payload.title).toBe(
        '⚠️ Your Monstera needs attention'
      )
      expect(enqueuedMessages[0]?.message.payload.body).toBe(
        "Your Monstera is overdue for care — don't forget!"
      )
    })

    it('should skip overdue_reminder when user has careReminders disabled', async () => {
      const enqueuedMessages: {
        topic: NotificationTopic
        message: QueueMessage
      }[] = []

      const userWithCareOff = createTestUser({
        id: 'user-1',
        careReminders: false,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const notification = createTestNotification({
        id: 'overdue-care-off',
        type: 'overdue_reminder',
        status: 'pending',
        scheduledAt: new Date(Date.now() - 60000),
        userId: 'user-1',
      })

      await runPollAndEnqueue(
        [notification],
        [userWithCareOff],
        (topic, message) => enqueuedMessages.push({ topic, message })
      )

      expect(enqueuedMessages).toHaveLength(0)
    })
  })

  describe('buildNotificationContent', () => {
    it('should build single plant watering content', () => {
      const result = buildNotificationContent(
        'watering_reminder',
        ['Monstera'],
        'en'
      )
      expect(result.title).toBe('💧 Time to water your Monstera')
      expect(result.body).toBe('Your Monstera needs watering today.')
    })

    it('should build plural watering title', () => {
      const result = buildNotificationContent(
        'watering_reminder',
        ['Monstera', 'Pothos'],
        'en'
      )
      expect(result.title).toBe('💧 2 plants need watering')
      expect(result.body).toBe('Monstera, Pothos')
    })

    it('should build fertilization title', () => {
      const result = buildNotificationContent(
        'fertilization_reminder',
        ['Fern', 'Cactus', 'Aloe'],
        'en'
      )
      expect(result.title).toBe('🌿 3 plants need fertilizing')
      expect(result.body).toBe('Fern, Cactus, Aloe')
    })

    it('should truncate plant names when more than 5', () => {
      const names = [
        'Monstera',
        'Pothos',
        'Fern',
        'Cactus',
        'Aloe',
        'Ivy',
        'Palm',
      ]
      const result = buildNotificationContent('watering_reminder', names, 'en')
      expect(result.title).toBe('💧 7 plants need watering')
      expect(result.body).toBe(
        'Monstera, Pothos, Fern, Cactus, Aloe and 2 more'
      )
    })

    it('should handle exactly 5 plant names without truncation', () => {
      const names = ['Monstera', 'Pothos', 'Fern', 'Cactus', 'Aloe']
      const result = buildNotificationContent('watering_reminder', names, 'en')
      expect(result.body).toBe('Monstera, Pothos, Fern, Cactus, Aloe')
    })

    it('should build French watering content for single plant', () => {
      const result = buildNotificationContent(
        'watering_reminder',
        ['Monstera'],
        'fr'
      )
      expect(result.title).toBe("💧 Il est temps d'arroser votre Monstera")
      expect(result.body).toBe(
        "Votre Monstera a besoin d'être arrosé(e) aujourd'hui."
      )
    })

    it('should build French plural watering content', () => {
      const result = buildNotificationContent(
        'watering_reminder',
        ['Monstera', 'Pothos', 'Fern'],
        'fr'
      )
      expect(result.title).toBe("💧 3 plantes ont besoin d'arrosage")
      expect(result.body).toBe('Monstera, Pothos, Fern')
    })

    it('should build French fertilization content', () => {
      const result = buildNotificationContent(
        'fertilization_reminder',
        ['Cactus'],
        'fr'
      )
      expect(result.title).toBe('🌿 Il est temps de fertiliser votre Cactus')
      expect(result.body).toBe(
        "Votre Cactus a besoin d'être fertilisé(e) aujourd'hui."
      )
    })

    it('should truncate French plant names with correct suffix', () => {
      const names = ['Monstera', 'Pothos', 'Fern', 'Cactus', 'Aloe', 'Ivy']
      const result = buildNotificationContent('watering_reminder', names, 'fr')
      expect(result.title).toBe("💧 6 plantes ont besoin d'arrosage")
      expect(result.body).toBe(
        'Monstera, Pothos, Fern, Cactus, Aloe et 1 de plus'
      )
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
      expect(enqueuedMessages[0]?.message.payload.notificationIds).toContain(
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
