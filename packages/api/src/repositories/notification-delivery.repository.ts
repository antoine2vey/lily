import {
  transitionEach,
  transitionEachEither,
} from '@lily/api/kernel/transition'
import {
  lockedInIdOrder,
  mapToNotification,
  type NotificationRow,
} from '@lily/api/repositories/helpers/notification-row'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { notifications } from '@lily/db/schema'
import { nowAsDate } from '@lily/shared'
import type { NotificationStatus } from '@lily/shared/notification'
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface DeferredNotification {
  readonly id: string
  readonly until: Date
}

export interface FailedAttempt {
  readonly id: string
  readonly status: Extract<NotificationStatus, 'pending' | 'failed'>
  readonly retryCount: number
}

/** One dequeue of a queue message: the message, and the claim of this dequeue. */
export interface DeliveryAttempt {
  readonly messageId: string
  readonly claim: string
}

export interface SentNotification {
  readonly id: string
  readonly title: string
  readonly body: string
}

/**
 * Delivery's moves of a notification: the claims of the scheduler and the
 * worker, each status they reach, and the drop of a row that must not be
 * sent.
 */
export class NotificationDelivery extends Context.Service<
  NotificationDelivery,
  {
    readonly findByIds: (
      ids: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<NotificationRow>, SqlError>
    readonly claimPendingToSchedule: (
      limit: number
    ) => Effect.Effect<NotificationRow[], SqlError>
    readonly releaseUnclaimed: (
      ids: ReadonlyArray<string>
    ) => Effect.Effect<void, SqlError>
    readonly deferUntil: (
      rows: ReadonlyArray<DeferredNotification>,
      heldBy: Option.Option<string>
    ) => Effect.Effect<void, SqlError>
    /**
     * Gives the queued rows no message holds, or this message holds, to this
     * dequeue of it. A redelivery takes the rows from the dequeue before it,
     * unless that one started its push. The dequeue that started a push
     * still holds its rows, so the discard of a message that died in its
     * push can fail them.
     */
    readonly claimForDelivery: (
      ids: ReadonlyArray<string>,
      attempt: DeliveryAttempt
    ) => Effect.Effect<ReadonlyArray<string>, SqlError>
    /**
     * Records that the push of the rows this dequeue still holds begins, and
     * returns them. Only those may be pushed. No dequeue can claim a row
     * after this, so a push that is never confirmed is not sent again.
     */
    readonly startPush: (
      ids: ReadonlyArray<string>,
      claim: string
    ) => Effect.Effect<ReadonlyArray<string>, SqlError>
    /**
     * Fails the rows whose push an earlier dequeue of this message started
     * before `startedBefore` and never confirmed. A redelivery passes the
     * time of its own dequeue: the queue hands a message out again only once
     * the dequeue before it went quiet. A push that started later belongs
     * to a dequeue that may still be sending.
     */
    readonly failUnconfirmed: (
      ids: ReadonlyArray<string>,
      messageId: string,
      startedBefore: Date,
      error: string
    ) => Effect.Effect<ReadonlyArray<FailedAttempt>, SqlError>
    readonly releaseUnclaimedOlderThan: (
      queuedBefore: Date
    ) => Effect.Effect<number, SqlError>
    readonly failAbandonedDeliveries: (
      queuedBefore: Date,
      error: string
    ) => Effect.Effect<number, SqlError>
    readonly retryLater: (
      ids: ReadonlyArray<string>,
      heldBy: string,
      retryAtAfterFailures: Array.NonEmptyReadonlyArray<Date>,
      error: string
    ) => Effect.Effect<ReadonlyArray<FailedAttempt>, SqlError>
    readonly deleteByIds: (
      ids: ReadonlyArray<string>
    ) => Effect.Effect<void, SqlError>
    readonly markManyAsSent: (
      rows: ReadonlyArray<SentNotification>
    ) => Effect.Effect<void, SqlError>
    readonly markManyAsFailed: (
      ids: readonly string[],
      error: string
    ) => Effect.Effect<void, SqlError>
    readonly setQueuedContent: (
      ids: readonly string[],
      title: string,
      body: string
    ) => Effect.Effect<void, SqlError>
  }
>()('NotificationDelivery') {}

export const NotificationDeliveryLive = Layer.effect(
  NotificationDelivery,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    return NotificationDelivery.of({
      findByIds: Effect.fn('NotificationDelivery.findByIds')(function* (
        ids: ReadonlyArray<string>
      ) {
        if (Array.isReadonlyArrayEmpty(ids)) return []
        const rows = yield* db
          .select()
          .from(notifications)
          .where(inArray(notifications.id, [...ids]))
        return Array.map(rows, mapToNotification)
      }),

      claimPendingToSchedule: Effect.fn(
        'NotificationDelivery.claimPendingToSchedule'
      )(function* (limit: number) {
        const now = nowAsDate()
        const due = db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.status, 'pending'),
              lte(notifications.scheduledAt, now)
            )
          )
          .orderBy(notifications.scheduledAt)
          .limit(limit)
          .for('update', { skipLocked: true })
        const rows = yield* transitionEach(db, 'Notification', {
          from: ['pending'],
          to: 'queued',
          also: { queuedAt: now },
          where: inArray(notifications.id, due),
        })
        return Array.map(rows, mapToNotification)
      }),

      releaseUnclaimed: Effect.fn('NotificationDelivery.releaseUnclaimed')(
        function* (ids: ReadonlyArray<string>) {
          if (ids.length === 0) return
          yield* transitionEach(db, 'Notification', {
            from: ['queued'],
            to: 'pending',
            also: { queuedAt: null },
            where: and(
              inArray(notifications.id, [...ids]),
              isNull(notifications.deliveryMessageId)
            ),
          })
        }
      ),

      deferUntil: Effect.fn('NotificationDelivery.deferUntil')(function* (
        rows: ReadonlyArray<DeferredNotification>,
        heldBy: Option.Option<string>
      ) {
        if (Array.isReadonlyArrayEmpty(rows)) return
        const scheduledAt = sql`CASE ${notifications.id} ${sql.join(
          Array.map(
            rows,
            (row) =>
              sql`WHEN ${row.id} THEN ${row.until.toISOString()}::timestamptz`
          ),
          sql` `
        )} END`
        yield* transitionEach(db, 'Notification', {
          from: ['queued'],
          to: 'pending',
          also: {
            queuedAt: null,
            deliveryMessageId: null,
            deliveryClaim: null,
            scheduledAt,
          },
          where: and(
            inArray(
              notifications.id,
              Array.map(rows, (row) => row.id)
            ),
            Option.match(heldBy, {
              onNone: () => isNull(notifications.deliveryMessageId),
              onSome: (claim) => eq(notifications.deliveryClaim, claim),
            })
          ),
        })
      }),

      claimForDelivery: Effect.fn('NotificationDelivery.claimForDelivery')(
        function* (ids: ReadonlyArray<string>, attempt: DeliveryAttempt) {
          if (ids.length === 0) return []
          const locked = yield* lockedInIdOrder(
            db,
            and(
              inArray(notifications.id, [...ids]),
              eq(notifications.status, 'queued'),
              or(
                isNull(notifications.pushStartedAt),
                eq(notifications.deliveryClaim, attempt.claim)
              ),
              or(
                isNull(notifications.deliveryMessageId),
                eq(notifications.deliveryMessageId, attempt.messageId)
              )
            )
          )
          const rows = yield* db
            .update(notifications)
            .set({
              deliveryMessageId: attempt.messageId,
              deliveryClaim: attempt.claim,
            })
            .where(inArray(notifications.id, locked))
            .returning({ id: notifications.id })
          return Array.map(rows, (row) => row.id)
        }
      ),

      startPush: Effect.fn('NotificationDelivery.startPush')(function* (
        ids: ReadonlyArray<string>,
        claim: string
      ) {
        if (ids.length === 0) return []
        const locked = yield* lockedInIdOrder(
          db,
          and(
            inArray(notifications.id, [...ids]),
            eq(notifications.status, 'queued'),
            eq(notifications.deliveryClaim, claim),
            isNull(notifications.pushStartedAt)
          )
        )
        const rows = yield* db
          .update(notifications)
          .set({ pushStartedAt: nowAsDate() })
          .where(inArray(notifications.id, locked))
          .returning({ id: notifications.id })
        return Array.map(rows, (row) => row.id)
      }),

      failUnconfirmed: Effect.fn('NotificationDelivery.failUnconfirmed')(
        function* (
          ids: ReadonlyArray<string>,
          messageId: string,
          startedBefore: Date,
          error: string
        ) {
          if (ids.length === 0) return []
          const locked = yield* lockedInIdOrder(
            db,
            and(
              inArray(notifications.id, [...ids]),
              eq(notifications.status, 'queued'),
              eq(notifications.deliveryMessageId, messageId),
              lt(notifications.pushStartedAt, startedBefore)
            )
          )
          const rows = yield* transitionEach(db, 'Notification', {
            from: ['queued'],
            to: 'failed',
            also: { lastError: error },
            where: inArray(notifications.id, locked),
          })
          return Array.map(
            rows,
            (row): FailedAttempt => ({
              id: row.id,
              status: 'failed',
              retryCount: row.retryCount,
            })
          )
        }
      ),

      releaseUnclaimedOlderThan: Effect.fn(
        'NotificationDelivery.releaseUnclaimedOlderThan'
      )(function* (queuedBefore: Date) {
        const locked = yield* lockedInIdOrder(
          db,
          and(
            eq(notifications.status, 'queued'),
            isNull(notifications.deliveryMessageId),
            lt(notifications.queuedAt, queuedBefore)
          )
        )
        const rows = yield* transitionEach(db, 'Notification', {
          from: ['queued'],
          to: 'pending',
          also: { queuedAt: null },
          where: inArray(notifications.id, locked),
        })
        return Array.length(rows)
      }),

      failAbandonedDeliveries: Effect.fn(
        'NotificationDelivery.failAbandonedDeliveries'
      )(function* (queuedBefore: Date, error: string) {
        const locked = yield* lockedInIdOrder(
          db,
          and(
            eq(notifications.status, 'queued'),
            or(
              isNull(notifications.queuedAt),
              and(
                isNotNull(notifications.deliveryMessageId),
                lt(notifications.queuedAt, queuedBefore)
              )
            )
          )
        )
        const rows = yield* transitionEach(db, 'Notification', {
          from: ['queued'],
          to: 'failed',
          also: { lastError: error },
          where: inArray(notifications.id, locked),
        })
        return Array.length(rows)
      }),

      retryLater: Effect.fn('NotificationDelivery.retryLater')(function* (
        ids: ReadonlyArray<string>,
        heldBy: string,
        retryAtAfterFailures: Array.NonEmptyReadonlyArray<Date>,
        error: string
      ) {
        if (Array.isReadonlyArrayEmpty(ids)) return []
        const retries = sql`${notifications.retryCount} < ${retryAtAfterFailures.length}`
        const whenRetried = (value: SQL, otherwise: SQL) =>
          sql`CASE WHEN ${retries} THEN ${value} ELSE ${otherwise} END`
        const locked = yield* lockedInIdOrder(
          db,
          and(
            inArray(notifications.id, [...ids]),
            eq(notifications.status, 'queued'),
            eq(notifications.deliveryClaim, heldBy)
          )
        )
        const rows = yield* transitionEachEither(db, 'Notification', {
          from: ['queued'],
          when: retries,
          to: 'pending',
          otherwise: 'failed',
          also: {
            retryCount: sql`${notifications.retryCount} + 1`,
            lastError: error,
            scheduledAt: sql`CASE ${notifications.retryCount} ${sql.join(
              Array.map(
                retryAtAfterFailures,
                (at, attempt) =>
                  sql`WHEN ${attempt} THEN ${at.toISOString()}::timestamptz`
              ),
              sql` `
            )} ELSE ${notifications.scheduledAt} END`,
            queuedAt: whenRetried(sql`NULL`, sql`${notifications.queuedAt}`),
            deliveryMessageId: whenRetried(
              sql`NULL`,
              sql`${notifications.deliveryMessageId}`
            ),
            deliveryClaim: whenRetried(
              sql`NULL`,
              sql`${notifications.deliveryClaim}`
            ),
            pushStartedAt: whenRetried(
              sql`NULL`,
              sql`${notifications.pushStartedAt}`
            ),
          },
          where: inArray(notifications.id, locked),
        })
        return Array.map(
          rows,
          (row): FailedAttempt => ({
            id: row.id,
            status: row.status === 'failed' ? 'failed' : 'pending',
            retryCount: row.retryCount,
          })
        )
      }),

      deleteByIds: Effect.fn('NotificationDelivery.deleteByIds')(function* (
        ids: ReadonlyArray<string>
      ) {
        if (ids.length === 0) return
        yield* db
          .delete(notifications)
          .where(inArray(notifications.id, [...ids]))
      }),

      markManyAsSent: Effect.fn('NotificationDelivery.markManyAsSent')(
        function* (rows: ReadonlyArray<SentNotification>) {
          if (Array.isReadonlyArrayEmpty(rows)) return
          const byId = (column: (row: SentNotification) => string) =>
            sql<string>`CASE ${notifications.id} ${sql.join(
              Array.map(rows, (row) => sql`WHEN ${row.id} THEN ${column(row)}`),
              sql` `
            )} END`
          yield* transitionEach(db, 'Notification', {
            from: ['queued'],
            to: 'sent',
            also: {
              sentAt: nowAsDate(),
              title: byId((row) => row.title),
              body: byId((row) => row.body),
            },
            where: inArray(
              notifications.id,
              Array.map(rows, (row) => row.id)
            ),
          })
        }
      ),

      markManyAsFailed: Effect.fn('NotificationDelivery.markManyAsFailed')(
        function* (ids: readonly string[], error: string) {
          if (ids.length === 0) return
          yield* transitionEach(db, 'Notification', {
            from: ['queued'],
            to: 'failed',
            also: { lastError: error },
            where: inArray(notifications.id, [...ids]),
          })
        }
      ),

      setQueuedContent: Effect.fn('NotificationDelivery.setQueuedContent')(
        function* (ids: readonly string[], title: string, body: string) {
          if (ids.length === 0) return
          yield* db
            .update(notifications)
            .set({ title, body })
            .where(
              and(
                inArray(notifications.id, [...ids]),
                eq(notifications.status, 'queued')
              )
            )
        }
      ),
    })
  })
)
