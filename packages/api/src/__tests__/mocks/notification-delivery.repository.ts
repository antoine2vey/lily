import type {
  MockNotificationsOptions,
  NotificationTable,
} from '@lily/api/__tests__/mocks/notification-table'
import { NotificationDelivery } from '@lily/api/repositories/notification-delivery.repository'
import { Array, Effect, Layer, Option, pipe, Result } from 'effect'

export const createMockNotificationDelivery = (
  table: NotificationTable,
  options: MockNotificationsOptions = {}
): Layer.Layer<NotificationDelivery> => {
  const { rows: notificationsState, queuedAt, deliveryClaims } = table
  const dequeueClaims = new Map<string, string>()
  const pushStarted = new Map<string, Date>()
  const release = (id: string) => {
    deliveryClaims.delete(id)
    dequeueClaims.delete(id)
    pushStarted.delete(id)
  }

  return Layer.succeed(
    NotificationDelivery,
    NotificationDelivery.of({
      findByIds: (ids: ReadonlyArray<string>) =>
        Effect.succeed(
          Array.filter(notificationsState, (n) => Array.contains(ids, n.id))
        ),

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
            const n = Array.findFirst(
              notificationsState,
              (row) => row.id === id
            )
            const holds = Option.match(heldBy, {
              onNone: () => !deliveryClaims.has(id),
              onSome: (claim) => dequeueClaims.get(id) === claim,
            })
            if (Option.isNone(n) || n.value.status !== 'queued' || !holds) {
              return
            }
            n.value.status = 'pending'
            n.value.scheduledAt = until
            queuedAt.delete(id)
            release(id)
          })
        }),

      claimForDelivery: (ids, { messageId, claim }) =>
        Effect.sync(() => {
          const claimed: string[] = []
          Array.forEach(notificationsState, (n) => {
            const owner = Option.fromNullishOr(deliveryClaims.get(n.id))
            const claimable =
              Array.contains(ids, n.id) &&
              n.status === 'queued' &&
              (!pushStarted.has(n.id) || dequeueClaims.get(n.id) === claim) &&
              Option.getOrElse(
                Option.map(owner, (id) => id === messageId),
                () => true
              )
            if (!claimable) return
            deliveryClaims.set(n.id, messageId)
            dequeueClaims.set(n.id, claim)
            claimed.push(n.id)
          })
          return claimed
        }),

      startPush: (ids, claim) =>
        Effect.sync(() => {
          const started = Array.filter(
            ids,
            (id) =>
              Array.some(
                notificationsState,
                (n) => n.id === id && n.status === 'queued'
              ) &&
              dequeueClaims.get(id) === claim &&
              !pushStarted.has(id)
          )
          Array.forEach(started, (id) => pushStarted.set(id, new Date()))
          return started
        }),

      failUnconfirmed: (ids, messageId, startedBefore, error) =>
        Effect.sync(() =>
          Array.filterMap(notificationsState, (n) => {
            if (
              !Array.contains(ids, n.id) ||
              n.status !== 'queued' ||
              deliveryClaims.get(n.id) !== messageId ||
              !Option.exists(
                Option.fromNullishOr(pushStarted.get(n.id)),
                (at) => at < startedBefore
              )
            ) {
              return Result.failVoid
            }
            n.status = 'failed'
            n.lastError = error
            return Result.succeed({
              id: n.id,
              status: n.status,
              retryCount: n.retryCount,
            })
          })
        ),

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
              at === undefined ||
              (deliveryClaims.has(n.id) && at < queuedBefore)
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
              dequeueClaims.get(n.id) !== heldBy
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
              release(n.id)
            }
            return Result.succeed({
              id: n.id,
              status: n.status,
              retryCount: n.retryCount,
            })
          })
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
    })
  )
}
