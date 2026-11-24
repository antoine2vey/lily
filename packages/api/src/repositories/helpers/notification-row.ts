import { rowsToLock } from '@lily/api/kernel/locks'
import type * as PgDrizzle from '@lily/db/effect-drizzle'
import { notifications } from '@lily/db/schema'
import type {
  Notification,
  NotificationStatus,
} from '@lily/shared/notification'
import type { NotificationTopic } from '@lily/shared/server'
import type { SQL } from 'drizzle-orm'
import { Option } from 'effect'

export type NotificationRow = Notification & {
  readonly type: NotificationTopic
  readonly params?: unknown
  /** The day a care or overdue reminder is about. Absent on every other row. */
  readonly occasionDay?: string | undefined
}

export const mapToNotification = (
  row: typeof notifications.$inferSelect
): NotificationRow => ({
  id: row.id,
  type: row.type,
  title: Option.getOrUndefined(Option.fromNullishOr(row.title)),
  body: Option.getOrUndefined(Option.fromNullishOr(row.body)),
  scheduledAt: row.scheduledAt,
  sentAt: Option.getOrUndefined(Option.fromNullishOr(row.sentAt)),
  isRead: row.isRead,
  status: row.status as NotificationStatus,
  retryCount: row.retryCount,
  lastError: Option.getOrUndefined(Option.fromNullishOr(row.lastError)),
  userId: row.userId,
  plantId: Option.getOrUndefined(Option.fromNullishOr(row.plantId)),
  metadata: Option.getOrUndefined(Option.fromNullishOr(row.metadata)),
  params: Option.getOrUndefined(Option.fromNullishOr(row.params)),
  occasionDay: Option.getOrUndefined(Option.fromNullishOr(row.occasionDay)),
  createdAt: row.createdAt,
})

/** The ids of the rows `where` selects, locked `FOR UPDATE` in id order. */
export const lockedInIdOrder = (
  db: PgDrizzle.PgDrizzle['Service'],
  where: SQL | undefined
) =>
  rowsToLock(
    'Notification',
    'update',
    db.select({ id: notifications.id }).from(notifications).where(where)
  )
