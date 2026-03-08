import {
  type FindNotificationsParams,
  type INotificationRepository,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import { paginate } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Option, pipe } from 'effect'

// Mutable version of Notification for internal mock state
type MutableNotification = {
  -readonly [K in keyof Notification]: Notification[K]
}

export const createMockNotificationRepository = (
  notifications: Notification[]
): Layer.Layer<NotificationRepository> => {
  // Use the passed array directly so callers can observe mutations
  const notificationsState = notifications as MutableNotification[]

  const repo: INotificationRepository = {
    findByUserId: (params: FindNotificationsParams) => {
      const page = pipe(
        Option.fromNullable(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullable(params.limit),
        Option.getOrElse(() => 20)
      )
      const offset = (page - 1) * limit

      let filtered = Array.filter(
        notificationsState,
        (n) => n.userId === params.userId
      )

      if (params.status && params.status !== 'all') {
        filtered = Array.filter(filtered, (n) => n.status === params.status)
      }

      // Sort by createdAt descending
      const sorted = [...filtered].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

      const total = sorted.length
      const items = sorted.slice(offset, offset + limit)

      return Effect.succeed(paginate(items, total, page, limit))
    },

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(notificationsState, (n) => n.id === id),
          Option.getOrNull
        )
      ),

    markAsRead: (id: string) => {
      const notificationOption = Array.findFirst(
        notificationsState,
        (n) => n.id === id
      )
      return Option.match(notificationOption, {
        onNone: () => Effect.succeed(null),
        onSome: (notification) =>
          Effect.succeed({ ...notification, isRead: true }),
      })
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
      return Effect.succeed(Option.getOrNull(Option.fromNullable(removed)))
    },

    // Scheduler methods
    findPendingToSchedule: (limit: number) =>
      Effect.succeed(
        pipe(
          Array.filter(
            notificationsState,
            (n) => n.status === 'pending' && n.scheduledAt <= new Date()
          ),
          (filtered) => filtered.slice(0, limit)
        )
      ),

    incrementRetryCount: (id: string) => {
      const notificationOption = Array.findFirst(
        notificationsState,
        (n) => n.id === id
      )
      return Option.match(notificationOption, {
        onNone: () => Effect.succeed(null),
        onSome: (notification) => {
          notification.retryCount += 1
          return Effect.succeed(notification)
        },
      })
    },

    deletePendingByPlantAndType: (plantId: string, type: string) =>
      Effect.sync(() => {
        const toKeep = Array.filter(
          notificationsState,
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

    findPendingByUserId: (userId: string) =>
      Effect.succeed(
        Array.filter(
          notificationsState,
          (n) => n.userId === userId && n.status === 'pending'
        )
      ),

    updateScheduledAt: (id: string, scheduledAt: Date) => {
      const notificationOption = Array.findFirst(
        notificationsState,
        (n) => n.id === id
      )
      return Option.match(notificationOption, {
        onNone: () => Effect.succeed(null),
        onSome: (notification) => {
          notification.scheduledAt = scheduledAt
          return Effect.succeed(notification)
        },
      })
    },

    // Batch scheduler methods
    markManyAsQueued: (ids: readonly string[]) =>
      Effect.sync(() => {
        Array.forEach(ids, (id) => {
          const n = Array.findFirst(notificationsState, (n) => n.id === id)
          Option.map(n, (notification) => {
            notification.status = 'queued'
          })
        })
      }),

    markManyAsSent: (ids: readonly string[]) =>
      Effect.sync(() => {
        Array.forEach(ids, (id) => {
          const n = Array.findFirst(notificationsState, (n) => n.id === id)
          Option.map(n, (notification) => {
            notification.status = 'sent'
            notification.sentAt = new Date()
          })
        })
      }),

    markManyAsFailed: (ids: readonly string[], error: string) =>
      Effect.sync(() => {
        Array.forEach(ids, (id) => {
          const n = Array.findFirst(notificationsState, (n) => n.id === id)
          Option.map(n, (notification) => {
            notification.status = 'failed'
            notification.lastError = error
          })
        })
      }),

    hasNotificationOfTypeTodayForUser: (
      userId: string,
      _timezone: string,
      type: string
    ) =>
      Effect.succeed(
        Array.some(
          notificationsState,
          (n) =>
            n.userId === userId &&
            n.type === type &&
            (n.status === 'pending' ||
              n.status === 'queued' ||
              n.status === 'sent')
        )
      ),
  }

  return Layer.succeed(NotificationRepository, repo)
}
