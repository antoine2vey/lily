import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockNotificationDelivery } from '@lily/api/__tests__/mocks/notification-delivery.repository'
import { createMockNotificationInbox } from '@lily/api/__tests__/mocks/notification-inbox.repository'
import { createMockReminderStore } from '@lily/api/__tests__/mocks/reminder-store'
import type { NotificationRow } from '@lily/api/repositories/helpers/notification-row'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Record } from 'effect'

export type MutableNotification = {
  -readonly [K in keyof NotificationRow]: NotificationRow[K]
}

/**
 * The `notifications` table every notification mock reads and writes. `rows`
 * is the array the test passed, so the test sees each write.
 */
export interface NotificationTable {
  readonly rows: MutableNotification[]
  readonly queuedAt: Map<string, Date>
  readonly deliveryClaims: Map<string, string>
  /** The occasion day of a row, by notification id. */
  readonly occasionDays: Map<string, string>
}

export interface MockNotificationsOptions {
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

export const waiting = (n: MutableNotification) =>
  n.status === 'pending' || n.status === 'queued'

export const deleteWhere = (
  table: NotificationTable,
  covers: (n: MutableNotification) => boolean
) => {
  const toKeep = Array.filter(table.rows, (n) => !covers(n))
  table.rows.length = 0
  table.rows.push(...toKeep)
}

// No unit test reaches these, so the mocks do not copy their SQL. The
// integration suites run them against Postgres.
export const UNTESTED = (what: string) =>
  `the notification mocks do not implement ${what}; test it in an integration suite`

export const untested = (method: string) => () =>
  Effect.die(new Error(UNTESTED(method)))

/**
 * One layer per service that touches `notifications`, all over the same
 * rows. A test provides the ones its code asks for.
 */
export const notificationMocks = (
  notifications: Notification[],
  options: MockNotificationsOptions = {}
) => {
  const table: NotificationTable = {
    rows: notifications as MutableNotification[],
    queuedAt: new Map(Record.toEntries(options.queuedAt ?? {})),
    deliveryClaims: new Map(Record.toEntries(options.deliveryClaims ?? {})),
    occasionDays: new Map(Record.toEntries(options.occasionDays ?? {})),
  }
  const repository = createMockNotificationRepository(table, options)
  const delivery = createMockNotificationDelivery(table, options)
  const reminderStore = createMockReminderStore(table)
  /** What recording a notice and dispatching it ask for. */
  const notices = Layer.mergeAll(repository, delivery)
  return {
    repository,
    inbox: createMockNotificationInbox(table),
    delivery,
    reminderStore,
    notices,
    /**
     * `layers` with the notices and the reminder store, whose key-share reads
     * go to the user and plant repositories of `layers`.
     */
    over: <ROut, E, RIn>(layers: Layer.Layer<ROut, E, RIn>) =>
      Layer.mergeAll(notices, reminderStore).pipe(Layer.provideMerge(layers)),
  }
}
