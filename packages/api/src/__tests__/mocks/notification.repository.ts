import {
  type INotificationRepository,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import type { Notification } from '@lily/shared/notification'
import { Effect, Layer } from 'effect'

export const createMockNotificationRepository = (
  notifications: Notification[]
): Layer.Layer<NotificationRepository> => {
  const repo: INotificationRepository = {
    findByUserId: (userId: string) =>
      Effect.succeed(notifications.filter((n) => n.userId === userId)),

    findById: (id: string) =>
      Effect.succeed(notifications.find((n) => n.id === id) ?? null),

    markAsRead: (id: string) => {
      const notification = notifications.find((n) => n.id === id)
      if (!notification) return Effect.succeed(null)
      return Effect.succeed({ ...notification, isRead: true })
    },

    create: (data) => {
      const newNotification: Notification = {
        id: `notification-${crypto.randomUUID()}`,
        type: data.type,
        title: data.title,
        body: data.body,
        scheduledAt: data.scheduledAt,
        isRead: false,
        userId: data.userId,
        plantId: data.plantId,
        createdAt: new Date(),
      }
      return Effect.succeed(newNotification)
    },

    delete: (id) => {
      const notification = notifications.find((n) => n.id === id)
      return Effect.succeed(notification ?? null)
    },
  }

  return Layer.succeed(NotificationRepository, repo)
}
