import {
  type FindNotificationsParams,
  type INotificationRepository,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import { paginate } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Effect, Layer } from 'effect'

// Mutable version of Notification for internal mock state
type MutableNotification = {
  -readonly [K in keyof Notification]: Notification[K]
}

export const createMockNotificationRepository = (
  notifications: Notification[]
): Layer.Layer<NotificationRepository> => {
  // Create a mutable copy for status updates
  const notificationsState: MutableNotification[] = notifications.map((n) => ({
    ...n,
  }))

  const repo: INotificationRepository = {
    findByUserId: (params: FindNotificationsParams) => {
      const page = params.page ?? 1
      const limit = params.limit ?? 20
      const offset = (page - 1) * limit

      let filtered = notificationsState.filter(
        (n) => n.userId === params.userId
      )

      if (params.status && params.status !== 'all') {
        filtered = filtered.filter((n) => n.status === params.status)
      }

      // Sort by createdAt descending
      filtered.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

      const total = filtered.length
      const items = filtered.slice(offset, offset + limit)

      return Effect.succeed(paginate(items, total, page, limit))
    },

    findById: (id: string) =>
      Effect.succeed(notificationsState.find((n) => n.id === id) ?? null),

    markAsRead: (id: string) => {
      const notification = notificationsState.find((n) => n.id === id)
      if (!notification) return Effect.succeed(null)
      return Effect.succeed({ ...notification, isRead: true })
    },

    create: (data) => {
      const newNotification: MutableNotification = {
        id: `notification-${crypto.randomUUID()}`,
        type: data.type,
        title: data.title,
        body: data.body,
        scheduledAt: data.scheduledAt,
        isRead: false,
        status: 'pending',
        retryCount: 0,
        userId: data.userId,
        plantId: data.plantId,
        createdAt: new Date(),
      }
      notificationsState.push(newNotification)
      return Effect.succeed(newNotification)
    },

    delete: (id) => {
      const idx = notificationsState.findIndex((n) => n.id === id)
      if (idx === -1) return Effect.succeed(null)
      const [removed] = notificationsState.splice(idx, 1)
      return Effect.succeed(removed ?? null)
    },

    // Scheduler methods
    findPendingToSchedule: (limit: number) =>
      Effect.succeed(
        notificationsState
          .filter((n) => n.status === 'pending' && n.scheduledAt <= new Date())
          .slice(0, limit)
      ),

    markAsQueued: (id: string) => {
      const notification = notificationsState.find((n) => n.id === id)
      if (!notification) return Effect.succeed(null)
      notification.status = 'queued'
      return Effect.succeed(notification)
    },

    markAsSent: (id: string) => {
      const notification = notificationsState.find((n) => n.id === id)
      if (!notification) return Effect.succeed(null)
      notification.status = 'sent'
      notification.sentAt = new Date()
      return Effect.succeed(notification)
    },

    markAsFailed: (id: string, error: string) => {
      const notification = notificationsState.find((n) => n.id === id)
      if (!notification) return Effect.succeed(null)
      notification.status = 'failed'
      notification.lastError = error
      return Effect.succeed(notification)
    },

    incrementRetryCount: (id: string) => {
      const notification = notificationsState.find((n) => n.id === id)
      if (!notification) return Effect.succeed(null)
      notification.retryCount += 1
      return Effect.succeed(notification)
    },

    deletePendingByPlantAndType: (plantId: string, type: string) =>
      Effect.sync(() => {
        const toKeep = notificationsState.filter(
          (n) =>
            !(
              n.plantId === plantId &&
              n.type === type &&
              n.status === 'pending'
            )
        )
        notificationsState.length = 0
        notificationsState.push(...toKeep)
      }),

    hasNotificationToday: (_userId: string, _plantId: string) =>
      Effect.succeed(false),
  }

  return Layer.succeed(NotificationRepository, repo)
}
