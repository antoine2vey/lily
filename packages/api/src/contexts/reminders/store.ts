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
  Life,
  type PlantState,
  type Recipient,
  type ReminderRow,
  reminderTypeOf,
} from '@lily/api/contexts/reminders/domain/plan'
import type { Transaction } from '@lily/api/kernel/transact'
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
  readonly plants: ReadonlyArray<PlantState>
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

const dueDayBeforeTheColumn = (
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

const dueDayOf = (
  stored: StoredReminder,
  cares: ReadonlyArray<DueCare>
): Option.Option<CareDay> =>
  pipe(
    Option.fromNullishOr(stored.occasionDay),
    Option.map((day) => CareDay.make(day)),
    Option.orElse(() => dueDayBeforeTheColumn(stored, cares))
  )

const rowOf = (
  stored: StoredReminder,
  cares: ReadonlyArray<DueCare>
): ReminderRow => {
  const row = {
    id: stored.id,
    userId: stored.userId,
    delivery: deliveryOf(stored),
    scheduledAt: DateTime.makeUnsafe(stored.scheduledAt),
  }
  return stored.type === 'overdue_reminder'
    ? { ...row, type: stored.type }
    : {
        ...row,
        type: stored.type,
        dueDay: dueDayOf(stored, cares),
      }
}

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
      Array.filter(cares, (care) => care.plant.id === plant.id)
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
          life:
            plant.diedAt === null
              ? Life.Living({
                  lines: Array.map(
                    due,
                    ({ careType, dueDay, status }): CareLine => ({
                      careType,
                      dueDay,
                      status,
                    })
                  ),
                })
              : Life.Dead(),
          remindersEnabled: plant.remindersEnabled,
          shared: plant.owner._tag === 'Canopy',
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

export const load = (
  plantIds: ReadonlyArray<string>
): Effect.Effect<Loaded, SqlError, StoreContext | Transaction> =>
  loadWithAccounts(plantIds, []).pipe(
    Effect.map(({ loaded }) => loaded),
    Effect.withSpan('ReminderStore.load')
  )

export const loadDigest = (
  recipientId: string,
  plantIds: ReadonlyArray<string>,
  roll: number
): Effect.Effect<
  Option.Option<OverdueDigest>,
  SqlError,
  StoreContext | Transaction
> =>
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

export const apply = (
  changes: ReadonlyArray<Change>
): Effect.Effect<
  void,
  SqlError,
  NotificationRepository | SqlClient.SqlClient | Transaction
> =>
  Effect.gen(function* () {
    if (Array.isReadonlyArrayEmpty(changes)) return
    const sql = yield* SqlClient.SqlClient
    const notificationRepo = yield* NotificationRepository
    yield* sql.withTransaction(
      notificationRepo.writeReminders({
        removeIds: pipe(
          changes,
          Array.filter(Change.$is('Remove')),
          Array.map((change) => change.rowId)
        ),
        retimes: pipe(
          changes,
          Array.filter(Change.$is('Retime')),
          Array.map((change) => ({
            id: change.rowId,
            scheduledAt: DateTime.toDateUtc(change.scheduledAt),
            occasionDay: change.occasion,
          }))
        ),
        inserts: pipe(
          changes,
          Array.filter(Change.$is('Put')),
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
