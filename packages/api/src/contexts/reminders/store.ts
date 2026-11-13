import {
  CareReads,
  type DueCare,
  DueScope,
  DueWindow,
} from '@lily/api/contexts/care'
import { audiencesOf } from '@lily/api/contexts/reminders/audience'
import type { OverdueDigest } from '@lily/api/contexts/reminders/domain/overdue'
import {
  type CareLine,
  Change,
  Delivery,
  type PlantState,
  type Recipient,
  type ReminderRow,
  type ReminderType,
  reminderTypeOf,
} from '@lily/api/contexts/reminders/domain/plan'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  NotificationRepository,
  type StoredReminder,
} from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantRow,
} from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import {
  adjustForDoNotDisturb,
  decodeDndBounds,
  preferredTimeOn,
} from '@lily/api/services/notifications/timezone-scheduler'
import type { users } from '@lily/db/schema'
import {
  CareDay,
  CareDays,
  pickNotificationTime,
  type VacationFields,
} from '@lily/shared'
import {
  Array,
  Data,
  DateTime,
  Effect,
  Match,
  Option,
  pipe,
  Schema,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type StoreContext =
  | NotificationRepository
  | UserRepository
  | DelegationRepository
  | CanopyRepository
  | PlantRepository
  | CareReads
  | SqlClient.SqlClient

/** What may have gone stale, in the form a replan request is stored in. */
export const DirtySchema = Schema.TaggedUnion({
  /** Every slot of these plants. */
  Plants: { plantIds: Schema.Array(Schema.String) },
  /** Every slot of the plants the canopy owns now. */
  Canopy: { canopyId: Schema.String },
  /**
   * This user's rows only, on the plants they own, care for or share through
   * their canopy, and on the plants they still hold a waiting row for.
   */
  Recipient: { userId: Schema.String },
})
export type Dirty = typeof DirtySchema.Type
export const Dirty = Data.taggedEnum<Dirty>()

export interface Loaded {
  readonly now: DateTime.Utc
  /** One entry per plant that still exists. A deleted plant's rows went with it. */
  readonly plants: ReadonlyArray<PlantState>
  /** Every audience member whose account exists. */
  readonly recipients: ReadonlyMap<string, Recipient>
}

type UserRow = typeof users.$inferSelect

/**
 * The settings a recipient's reminders are planned from. Whoever changes one
 * of them owes Reminders a `Dirty.Recipient`. The account status and the
 * vacation are planned from too, and the code that changes those says so.
 */
export const RECIPIENT_SETTINGS = [
  'careReminders',
  'timezone',
  'preferredNotificationTime',
  'doNotDisturb',
  'doNotDisturbStart',
  'doNotDisturbEnd',
] as const satisfies ReadonlyArray<keyof UserRow>

type RecipientRow = Pick<
  UserRow,
  'id' | 'status' | keyof VacationFields | (typeof RECIPIENT_SETTINGS)[number]
>

/** The plants a `Dirty` names right now. Takes no lock. */
export const plantsOf = (
  dirty: Dirty
): Effect.Effect<
  ReadonlyArray<string>,
  SqlError,
  PlantRepository | CanopyRepository | NotificationRepository
> =>
  Dirty.$match(dirty, {
    Plants: ({ plantIds }) => Effect.succeed(Array.dedupe(plantIds)),
    Canopy: ({ canopyId }) =>
      Effect.flatMap(CanopyRepository, (repo) =>
        repo.findPlantIdsOfCanopy(canopyId)
      ),
    Recipient: ({ userId }) =>
      Effect.gen(function* () {
        const plantRepo = yield* PlantRepository
        const canopyRepo = yield* CanopyRepository
        const notificationRepo = yield* NotificationRepository
        const personal = yield* plantRepo.findPersonalReminderPlantIds(userId)
        const membership = yield* canopyRepo.findMembershipByUser(userId)
        const shared =
          membership === null
            ? []
            : yield* canopyRepo.findPlantIdsOfCanopy(membership.canopyId)
        const stillHeld =
          yield* notificationRepo.findPlantIdsOfWaitingReminders(userId)
        return Array.dedupe([...personal, ...shared, ...stillHeld])
      }),
  })

const zoneOf = (timezone: string | null) =>
  pipe(
    Option.fromNullishOr(timezone),
    Option.flatMap(DateTime.zoneMakeNamed),
    Option.getOrElse(() => DateTime.zoneMakeNamedUnsafe('UTC'))
  )

const noonOn = (day: CareDay, timezone: string | null): Date => {
  const {
    year,
    month,
    day: dayOfMonth,
  } = DateTime.toPartsUtc(CareDays.startOf(day, 'UTC'))
  return DateTime.toDateUtc(
    DateTime.makeZonedUnsafe(
      { year, month, day: dayOfMonth, hour: 12 },
      { timeZone: zoneOf(timezone), adjustForTimeZone: true }
    )
  )
}

const sendTimeOn = (day: CareDay, user: RecipientRow) =>
  Effect.gen(function* () {
    const preferred = yield* preferredTimeOn(
      noonOn(day, user.timezone),
      user.timezone,
      user.preferredNotificationTime
    )
    const sendAt = user.doNotDisturb
      ? yield* decodeDndBounds(
          user.doNotDisturbStart,
          user.doNotDisturbEnd
        ).pipe(
          Effect.annotateLogs({ userId: user.id }),
          Effect.flatMap((bounds) =>
            adjustForDoNotDisturb(preferred, user.timezone, bounds)
          )
        )
      : preferred
    return [day, DateTime.makeUnsafe(sendAt)] as const
  })

const recipientOf = (user: RecipientRow, dueDays: ReadonlyArray<CareDay>) =>
  Effect.map(
    Effect.forEach(dueDays, (day) => sendTimeOn(day, user)),
    (sendTimes): Recipient => ({
      id: user.id,
      active: user.status === 'active',
      careReminders: user.careReminders,
      vacation: user,
      sendTimes: new Map(sendTimes),
    })
  )

const deliveryOf = (stored: StoredReminder): Delivery =>
  Match.value(stored.status).pipe(
    Match.when('sent', () => Delivery.Sent()),
    Match.when('failed', () => Delivery.Failed()),
    Match.orElse((status) => {
      if (stored.inFlight) return Delivery.InFlight()
      return status === 'queued'
        ? Delivery.Queued()
        : Delivery.Pending({ retrying: stored.retryCount > 0 })
    })
  )

const occasionBeforeTheColumn = (
  stored: StoredReminder,
  cares: ReadonlyArray<DueCare>
): Option.Option<CareDay> =>
  pipe(
    Array.findFirst(
      cares,
      (care) => reminderTypeOf(care.careType) === stored.type
    ),
    Option.map((care) =>
      stored.status === 'pending'
        ? care.dueDay
        : CareDays.of(
            DateTime.makeUnsafe(stored.sentAt ?? stored.scheduledAt),
            care.careTimezone
          )
    )
  )

const occasionOf = (
  stored: StoredReminder,
  cares: ReadonlyArray<DueCare>
): Option.Option<CareDay> =>
  pipe(
    Option.fromNullishOr(stored.occasionDay),
    Option.map((day) => CareDay.make(day)),
    Option.orElse(() => occasionBeforeTheColumn(stored, cares))
  )

const rowOf = (
  stored: StoredReminder,
  cares: ReadonlyArray<DueCare>
): ReminderRow => ({
  id: stored.id,
  userId: stored.userId,
  type: stored.type as ReminderType,
  delivery: deliveryOf(stored),
  scheduledAt: DateTime.makeUnsafe(stored.scheduledAt),
  occasion: occasionOf(stored, cares),
})

const BEFORE_THE_COLUMN_LOOKBACK_DAYS = 2

const loadWithAccounts = (
  plantIds: ReadonlyArray<string>,
  alsoAccounts: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const careReads = yield* CareReads
    const userRepo = yield* UserRepository
    const notificationRepo = yield* NotificationRepository

    yield* notificationRepo.lockReminderPlants(plantIds)
    const seen = yield* plantRepo.findByIds(plantIds)
    const addressed = yield* audiencesOf(seen)
    const holders = yield* notificationRepo.findHoldersOfWaitingReminders(
      Array.map(seen, (plant) => plant.id)
    )
    const accounts = yield* userRepo.findByIdsForKeyShare(
      Array.dedupe([
        ...Array.flatMap(addressed, ([, audience]) => audience),
        ...holders,
        ...alsoAccounts,
      ])
    )
    const remaining = yield* plantRepo.findByIdsForKeyShare(
      Array.map(seen, (plant) => plant.id)
    )
    const audiences = Array.filter(addressed, ([plant]) =>
      Array.some(remaining, (row) => row.id === plant.id)
    )
    const ids = Array.map(audiences, ([plant]) => plant.id)
    const cares = yield* careReads.due({
      scope: DueScope.Plants({ plantIds: ids }),
      upTo: DueWindow.Any(),
    })
    const caresOf = (plant: PlantRow) =>
      plant.diedAt === null
        ? Array.filter(cares, (care) => care.plant.id === plant.id)
        : []
    const now = yield* DateTime.now
    const recipients = yield* Effect.forEach(accounts, (user) =>
      recipientOf(
        user,
        pipe(
          audiences,
          Array.filter(([, audience]) => Array.contains(audience, user.id)),
          Array.flatMap(([plant]) => caresOf(plant)),
          Array.map((care) => care.dueDay),
          Array.dedupe
        )
      )
    )
    const stored = yield* notificationRepo.lockReminders({
      plantIds: ids,
      occasionDays: Array.dedupe(Array.map(cares, (care) => care.dueDay)),
      unmarkedSince: DateTime.toDateUtc(
        DateTime.subtract(now, { days: BEFORE_THE_COLUMN_LOOKBACK_DAYS })
      ),
    })

    const loaded: Loaded = {
      now,
      plants: Array.map(audiences, ([plant, audience]): PlantState => {
        const due = caresOf(plant)
        return {
          id: plant.id,
          living: plant.diedAt === null,
          remindersEnabled: plant.remindersEnabled,
          shared: plant.owner._tag === 'Canopy',
          lines: Array.map(
            due,
            ({ careType, dueDay, status }): CareLine => ({
              careType,
              dueDay,
              status,
            })
          ),
          audience,
          rows: pipe(
            stored,
            Array.filter((row) => row.plantId === plant.id),
            Array.map((row) => rowOf(row, due))
          ),
        }
      }),
      recipients: new Map(
        Array.map(recipients, (recipient) => [recipient.id, recipient])
      ),
    }
    return { loaded, accounts }
  })

/**
 * Reads everything the rule plans from, for these plants, and locks it until
 * the transaction ends. Must run in a transaction.
 */
export const load = (
  plantIds: ReadonlyArray<string>
): Effect.Effect<Loaded, SqlError, StoreContext> =>
  loadWithAccounts(plantIds, []).pipe(
    Effect.map(({ loaded }) => loaded),
    Effect.withSpan('ReminderStore.load')
  )

/**
 * Reads what one recipient's overdue digest is planned from: `load` with the
 * same locks in the same order, the recipient's account locked with the
 * audience, then whether they were already reminded on their day. None when
 * the account is gone. Must run in a transaction.
 *
 * `roll` draws the slot within the day; see `pickNotificationTime`.
 */
export const loadDigest = (
  recipientId: string,
  plantIds: ReadonlyArray<string>,
  roll: number
): Effect.Effect<Option.Option<OverdueDigest>, SqlError, StoreContext> =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
    const { loaded, accounts } = yield* loadWithAccounts(plantIds, [
      recipientId,
    ])
    const account = Array.findFirst(accounts, (user) => user.id === recipientId)
    const recipient = Option.fromNullishOr(loaded.recipients.get(recipientId))
    if (Option.isNone(account) || Option.isNone(recipient)) {
      return Option.none()
    }
    const user = account.value
    const timezone = zoneOf(user.timezone).id
    const day = CareDays.of(loaded.now, timezone)
    const slot = yield* pickNotificationTime(
      user.id,
      timezone,
      user.doNotDisturb,
      user.doNotDisturbStart,
      user.doNotDisturbEnd,
      roll
    ).pipe(Effect.map(DateTime.makeUnsafe), Effect.option)
    const alreadyReminded = yield* notificationRepo.hasOverdueReminderOn({
      userId: user.id,
      day,
      from: DateTime.toDateUtc(CareDays.startOf(day, timezone)),
      until: DateTime.toDateUtc(
        CareDays.startOf(CareDays.addDays(day, 1), timezone)
      ),
    })
    return Option.some({
      recipient: recipient.value,
      candidates: loaded.plants,
      day,
      alreadyReminded,
      slot,
      now: loaded.now,
    })
  }).pipe(Effect.withSpan('ReminderStore.loadDigest'))

/**
 * Writes a plan in one transaction. A removal skips a row a worker took in
 * the meantime. A put over a row re-times it only while it is pending and
 * not retried; a put of a new row is skipped when any row of the slot already
 * carries the occasion.
 */
export const apply = (
  changes: ReadonlyArray<Change>
): Effect.Effect<
  void,
  SqlError,
  NotificationRepository | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    if (Array.isReadonlyArrayEmpty(changes)) return
    const sql = yield* SqlClient.SqlClient
    const notificationRepo = yield* NotificationRepository
    const puts = Array.filter(changes, Change.$is('Put'))
    yield* sql.withTransaction(
      notificationRepo.writeReminders({
        removeIds: pipe(
          changes,
          Array.filter(Change.$is('Remove')),
          Array.map((change) => change.rowId)
        ),
        retimes: Array.flatMap(puts, (change) =>
          Option.match(change.over, {
            onNone: () => [],
            onSome: (id) => [
              {
                id,
                scheduledAt: DateTime.toDateUtc(change.scheduledAt),
                occasionDay: change.occasion,
              },
            ],
          })
        ),
        inserts: pipe(
          puts,
          Array.filter((change) => Option.isNone(change.over)),
          Array.map((change) => ({
            type: change.type,
            userId: change.userId,
            plantId: change.plantId,
            scheduledAt: DateTime.toDateUtc(change.scheduledAt),
            occasionDay: change.occasion,
          }))
        ),
      })
    )
  }).pipe(Effect.withSpan('ReminderStore.apply'))
