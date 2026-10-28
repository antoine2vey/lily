import {
  type FindNotificationsParams,
  type INotificationRepository,
  NotificationRepository,
} from '@lily/api/repositories/notification.repository'
import { paginate } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Option, pipe, Record } from 'effect'

// Mutable version of Notification for internal mock state
type MutableNotification = {
  -readonly [K in keyof Notification]: Notification[K]
}

export interface MockNotificationRepositoryOptions {
  queuedAt?: Record<string, Date>
  deliveryClaims?: Record<string, string>
  canopyPlants?: Record<string, ReadonlyArray<string>>
}

export const createMockNotificationRepository = (
  notifications: Notification[],
  options: MockNotificationRepositoryOptions = {}
): Layer.Layer<NotificationRepository> => {
  // Use the passed array directly so callers can observe mutations
  const notificationsState = notifications as MutableNotification[]
  const queuedAt = new Map(Record.toEntries(options.queuedAt ?? {}))
  const deliveryClaims = new Map(Record.toEntries(options.deliveryClaims ?? {}))

  const repo: INotificationRepository = {
    findByUserId: (params: FindNotificationsParams) => {
      const page = pipe(
        Option.fromNullishOr(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullishOr(params.limit),
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
      const status = data.status ?? 'pending'
      const newNotification: MutableNotification = {
        id: `notification-${crypto.randomUUID()}`,
        type: data.type,
        title: data.title,
        body: data.body,
        scheduledAt: data.scheduledAt,
        isRead: false,
        status,
        retryCount: 0,
        userId: data.userId,
        plantId: data.plantId,
        createdAt: new Date(),
      }
      if (status === 'queued') queuedAt.set(newNotification.id, new Date())
      notificationsState.push(newNotification)
      return Effect.succeed(newNotification)
    },

    delete: (id) => {
      const idx = notificationsState.findIndex((n) => n.id === id)
      if (idx === -1) return Effect.succeed(null)
      const [removed] = notificationsState.splice(idx, 1)
      return Effect.succeed(Option.getOrNull(Option.fromNullishOr(removed)))
    },

    // Scheduler methods
    claimPendingToSchedule: (limit: number) =>
      Effect.sync(() => {
        const now = new Date()
        const claimed = pipe(
          Array.filter(
            notificationsState,
            (n) => n.status === 'pending' && n.scheduledAt <= now
          ),
          Array.take(limit)
        )
        Array.forEach(claimed, (n) => {
          n.status = 'queued'
          queuedAt.set(n.id, now)
        })
        return claimed
      }),

    releaseUnclaimed: (ids) =>
      Effect.sync(() => {
        Array.forEach(notificationsState, (n) => {
          if (
            Array.contains(ids, n.id) &&
            n.status === 'queued' &&
            !deliveryClaims.has(n.id)
          ) {
            n.status = 'pending'
            queuedAt.delete(n.id)
          }
        })
      }),

    claimForDelivery: (ids, messageId) =>
      Effect.sync(() => {
        const claimed: string[] = []
        Array.forEach(notificationsState, (n) => {
          const owner = Option.fromNullishOr(deliveryClaims.get(n.id))
          const claimable =
            Array.contains(ids, n.id) &&
            n.status === 'queued' &&
            Option.getOrElse(
              Option.map(owner, (id) => id === messageId),
              () => true
            )
          if (!claimable) return
          deliveryClaims.set(n.id, messageId)
          claimed.push(n.id)
        })
        return claimed
      }),

    releaseUnclaimedOlderThan: (queuedBefore) =>
      Effect.sync(() => {
        let count = 0
        Array.forEach(notificationsState, (n) => {
          const at = queuedAt.get(n.id)
          if (
            n.status === 'queued' &&
            !deliveryClaims.has(n.id) &&
            at !== undefined &&
            at < queuedBefore
          ) {
            n.status = 'pending'
            queuedAt.delete(n.id)
            count++
          }
        })
        return count
      }),

    failAbandonedDeliveries: (queuedBefore, error) =>
      Effect.sync(() => {
        let count = 0
        Array.forEach(notificationsState, (n) => {
          const at = queuedAt.get(n.id)
          const abandoned =
            at === undefined || (deliveryClaims.has(n.id) && at < queuedBefore)
          if (n.status === 'queued' && abandoned) {
            n.status = 'failed'
            n.lastError = error
            count++
          }
        })
        return count
      }),

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

    deletePendingByUserIdAndTypes: (
      userId: string,
      types: ReadonlyArray<string>
    ) =>
      Effect.sync(() => {
        const toKeep = Array.filter(
          notificationsState,
          (n) =>
            !(
              n.userId === userId &&
              Array.contains(types, n.type) &&
              n.status === 'pending'
            )
        )
        notificationsState.length = 0
        notificationsState.push(...toKeep)
      }),

    deletePendingByPlantId: (plantId: string) =>
      Effect.sync(() => {
        const toKeep = Array.filter(
          notificationsState,
          (n) => !(n.plantId === plantId && n.status === 'pending')
        )
        notificationsState.length = 0
        notificationsState.push(...toKeep)
      }),

    deleteUndeliveredByUserAndPlant: (userId: string, plantId: string) =>
      Effect.sync(() => {
        const toKeep = Array.filter(
          notificationsState,
          (n) =>
            !(
              n.userId === userId &&
              n.plantId === plantId &&
              (n.status === 'pending' || n.status === 'queued')
            )
        )
        notificationsState.length = 0
        notificationsState.push(...toKeep)
      }),

    createPendingMany: (rows) =>
      Effect.sync(() => {
        Array.forEach(rows, (row) => {
          notificationsState.push({
            id: `notification-${crypto.randomUUID()}`,
            type: row.type,
            title: row.title,
            body: row.body,
            scheduledAt: row.scheduledAt,
            isRead: false,
            status: 'pending',
            retryCount: 0,
            userId: row.userId,
            plantId: row.plantId,
            createdAt: new Date(),
          })
        })
      }),

    deleteUndeliveredForMemberOnCanopy: (userId: string, canopyId: string) =>
      Effect.sync(() => {
        const plantIds = options.canopyPlants?.[canopyId] ?? []
        const covers = (n: MutableNotification) =>
          n.userId === userId &&
          (n.status === 'pending' || n.status === 'queued') &&
          n.plantId !== undefined &&
          Array.contains(plantIds, n.plantId)
        const toKeep = Array.filter(notificationsState, (n) => !covers(n))
        notificationsState.length = 0
        notificationsState.push(...toKeep)
      }),

    deleteByIds: (ids: ReadonlyArray<string>) =>
      Effect.sync(() => {
        const toKeep = Array.filter(
          notificationsState,
          (n) => !Array.contains(ids, n.id)
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
    markManyAsSent: (ids: readonly string[]) =>
      Effect.sync(() => {
        Array.forEach(ids, (id) => {
          const n = Array.findFirst(
            notificationsState,
            (n) => n.id === id && n.status === 'queued'
          )
          Option.map(n, (notification) => {
            notification.status = 'sent'
            notification.sentAt = new Date()
          })
        })
      }),

    markManyAsFailed: (ids: readonly string[], error: string) =>
      Effect.sync(() => {
        Array.forEach(ids, (id) => {
          const n = Array.findFirst(
            notificationsState,
            (n) => n.id === id && n.status === 'queued'
          )
          Option.map(n, (notification) => {
            notification.status = 'failed'
            notification.lastError = error
          })
        })
      }),

    countUnreadByUserId: (userId: string) =>
      Effect.succeed(
        Array.filter(
          notificationsState,
          (n) =>
            n.userId === userId && n.status === 'sent' && n.isRead === false
        ).length
      ),

    markAllAsReadByUserId: (userId: string) =>
      Effect.sync(() => {
        Array.forEach(
          Array.filter(
            notificationsState,
            (n) => n.userId === userId && !n.isRead
          ),
          (n) => {
            n.isRead = true
          }
        )
      }),

    setQueuedContent: (ids: readonly string[], title: string, body: string) =>
      Effect.sync(() => {
        Array.forEach(ids, (id) => {
          const n = Array.findFirst(
            notificationsState,
            (n) => n.id === id && n.status === 'queued'
          )
          Option.map(n, (notification) => {
            notification.title = title
            notification.body = body
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
