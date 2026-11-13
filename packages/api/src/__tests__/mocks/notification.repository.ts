import {
  type FindNotificationsParams,
  type INotificationRepository,
  isReminderTopic,
  NotificationRepository,
  type NotificationRow,
} from '@lily/api/repositories/notification.repository'
import { paginate } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { CARE_TOPICS } from '@lily/shared/server'
import {
  Array,
  Effect,
  Equal,
  Layer,
  Option,
  pipe,
  Record,
  Result,
} from 'effect'

// Mutable version of Notification for internal mock state
type MutableNotification = {
  -readonly [K in keyof NotificationRow]: NotificationRow[K]
}

export interface MockNotificationRepositoryOptions {
  queuedAt?: Record<string, Date>
  deliveryClaims?: Record<string, string>
  /** The occasion day of a seeded row, by notification id. */
  occasionDays?: Record<string, string>
  /** The ids of a Canopy's plants at call time, like the real subquery. */
  canopyPlants?: (canopyId: string) => ReadonlyArray<string>
  /** The user who owns a plant at call time, null for a Canopy plant. */
  plantOwner?: (plantId: string) => string | null
  onCreate?: (notification: Notification) => void
  onRetryLater?: (ids: ReadonlyArray<string>) => void
}

export const createMockNotificationRepository = (
  notifications: Notification[],
  options: MockNotificationRepositoryOptions = {}
): Layer.Layer<NotificationRepository> => {
  // Use the passed array directly so callers can observe mutations
  const notificationsState = notifications as MutableNotification[]
  const queuedAt = new Map(Record.toEntries(options.queuedAt ?? {}))
  const deliveryClaims = new Map(Record.toEntries(options.deliveryClaims ?? {}))
  const occasionDays = new Map(Record.toEntries(options.occasionDays ?? {}))

  const waiting = (n: MutableNotification) =>
    n.status === 'pending' || n.status === 'queued'
  const deleteWhere = (covers: (n: MutableNotification) => boolean) => {
    const toKeep = Array.filter(notificationsState, (n) => !covers(n))
    notificationsState.length = 0
    notificationsState.push(...toKeep)
  }

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

    findByIds: (ids: ReadonlyArray<string>) =>
      Effect.succeed(
        Array.filter(notificationsState, (n) => Array.contains(ids, n.id))
      ),

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
        params: data.params,
        scheduledAt: data.scheduledAt,
        isRead: false,
        status,
        retryCount: 0,
        userId: data.userId,
        plantId: data.plantId,
        metadata: data.metadata,
        createdAt: new Date(),
      }
      if (status === 'queued') queuedAt.set(newNotification.id, new Date())
      notificationsState.push(newNotification)
      options.onCreate?.(newNotification)
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

    deferUntil: (rows, heldBy) =>
      Effect.sync(() => {
        Array.forEach(rows, ({ id, until }) => {
          const n = Array.findFirst(notificationsState, (row) => row.id === id)
          const holder = Option.fromNullishOr(deliveryClaims.get(id))
          if (
            Option.isNone(n) ||
            n.value.status !== 'queued' ||
            !Equal.equals(holder, heldBy)
          ) {
            return
          }
          n.value.status = 'pending'
          n.value.scheduledAt = until
          queuedAt.delete(id)
          deliveryClaims.delete(id)
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

    retryLater: (ids, heldBy, retryAtAfterFailures, error) =>
      Effect.sync(() => {
        options.onRetryLater?.(ids)
        return Array.filterMap(notificationsState, (n) => {
          if (
            !Array.contains(ids, n.id) ||
            n.status !== 'queued' ||
            deliveryClaims.get(n.id) !== heldBy
          ) {
            return Result.failVoid
          }
          const due = Array.get(retryAtAfterFailures, n.retryCount)
          n.retryCount += 1
          n.lastError = error
          if (Option.isNone(due)) {
            n.status = 'failed'
          } else {
            n.status = 'pending'
            n.scheduledAt = due.value
            queuedAt.delete(n.id)
            deliveryClaims.delete(n.id)
          }
          return Result.succeed({
            id: n.id,
            status: n.status,
            retryCount: n.retryCount,
          })
        })
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

    lockReminderPlants: () => Effect.void,

    findHoldersOfWaitingReminders: (plantIds) =>
      Effect.sync(() =>
        pipe(
          notificationsState,
          Array.filter(
            (n) =>
              waiting(n) &&
              n.plantId !== undefined &&
              Array.contains(plantIds, n.plantId) &&
              Array.contains(CARE_TOPICS, n.type)
          ),
          Array.map((n) => n.userId),
          Array.dedupe
        )
      ),

    lockReminders: (query) =>
      Effect.sync(() =>
        Array.flatMap(notificationsState, (n) => {
          const waiting =
            (n.status === 'pending' || n.status === 'queued') &&
            !deliveryClaims.has(n.id)
          const occasionDay = occasionDays.get(n.id) ?? null
          const read =
            waiting ||
            n.status === 'pending' ||
            n.status === 'queued' ||
            (occasionDay === null
              ? (n.sentAt ?? n.scheduledAt) >= query.unmarkedSince
              : Array.contains(query.occasionDays, occasionDay))
          return n.plantId !== undefined &&
            Array.contains(query.plantIds, n.plantId) &&
            isReminderTopic(n.type) &&
            read
            ? [
                {
                  id: n.id,
                  userId: n.userId,
                  plantId: n.plantId,
                  type: n.type,
                  status: n.status,
                  inFlight: deliveryClaims.has(n.id),
                  retryCount: n.retryCount,
                  scheduledAt: n.scheduledAt,
                  sentAt: n.sentAt ?? null,
                  occasionDay,
                },
              ]
            : []
        })
      ),

    writeReminders: (writes) =>
      Effect.sync(() => {
        const toKeep = Array.filter(
          notificationsState,
          (n) =>
            !(
              Array.contains(writes.removeIds, n.id) &&
              (n.status === 'pending' || n.status === 'queued') &&
              !deliveryClaims.has(n.id)
            )
        )
        notificationsState.length = 0
        notificationsState.push(...toKeep)
        Array.forEach(writes.retimes, (retime) => {
          const row = notificationsState.find((n) => n.id === retime.id)
          if (row?.status !== 'pending' || row.retryCount > 0) return
          row.scheduledAt = retime.scheduledAt
          occasionDays.set(row.id, retime.occasionDay)
        })
        Array.forEach(writes.inserts, (insert) => {
          const standing = notificationsState.find(
            (n) =>
              n.userId === insert.userId &&
              n.plantId === insert.plantId &&
              n.type === insert.type &&
              occasionDays.get(n.id) === insert.occasionDay
          )
          if (standing !== undefined) {
            if (standing.status === 'pending' && standing.retryCount === 0) {
              standing.scheduledAt = insert.scheduledAt
            }
            return
          }
          const id = `notification-${crypto.randomUUID()}`
          occasionDays.set(id, insert.occasionDay)
          notificationsState.push({
            id,
            type: insert.type,
            scheduledAt: insert.scheduledAt,
            isRead: false,
            status: 'pending',
            retryCount: 0,
            userId: insert.userId,
            plantId: insert.plantId,
            createdAt: new Date(),
          })
        })
      }),

    hasOverdueReminderOn: (query) =>
      Effect.sync(() =>
        Array.some(notificationsState, (n) => {
          const occasionDay = occasionDays.get(n.id) ?? null
          return (
            n.userId === query.userId &&
            n.type === 'overdue_reminder' &&
            (occasionDay === null
              ? n.createdAt >= query.from && n.createdAt < query.until
              : occasionDay === query.day)
          )
        })
      ),

    findPlantIdsOfWaitingReminders: (userId: string) =>
      Effect.sync(() =>
        pipe(
          notificationsState,
          Array.filter(
            (n) =>
              n.userId === userId &&
              waiting(n) &&
              Array.contains(CARE_TOPICS, n.type)
          ),
          Array.flatMap((n) => (n.plantId === undefined ? [] : [n.plantId])),
          Array.dedupe
        )
      ),

    deleteUndeliveredNonCareForMemberOnCanopy: (
      userId: string,
      canopyId: string
    ) =>
      Effect.sync(() => {
        const plantIds = options.canopyPlants?.(canopyId) ?? []
        deleteWhere(
          (n) =>
            n.userId === userId &&
            waiting(n) &&
            !Array.contains(CARE_TOPICS, n.type) &&
            n.plantId !== undefined &&
            Array.contains(plantIds, n.plantId)
        )
      }),

    deleteUndeliveredNonCareOfNonOwners: (plantIds: ReadonlyArray<string>) =>
      Effect.sync(() => {
        deleteWhere(
          (n) =>
            n.plantId !== undefined &&
            Array.contains(plantIds, n.plantId) &&
            waiting(n) &&
            !deliveryClaims.has(n.id) &&
            !Array.contains(CARE_TOPICS, n.type) &&
            options.plantOwner?.(n.plantId) !== n.userId
        )
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

    // Batch scheduler methods
    markManyAsSent: (rows) =>
      Effect.sync(() => {
        Array.forEach(rows, ({ id, title, body }) => {
          const n = Array.findFirst(
            notificationsState,
            (n) => n.id === id && n.status === 'queued'
          )
          Option.map(n, (notification) => {
            notification.status = 'sent'
            notification.sentAt = new Date()
            notification.title = title
            notification.body = body
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
