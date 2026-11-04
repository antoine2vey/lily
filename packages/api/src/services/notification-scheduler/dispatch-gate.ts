import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { NotificationRow } from '@lily/api/repositories/notification.repository'
import {
  adjustForDoNotDisturb,
  decodeDndBounds,
  isInDoNotDisturbWindow,
} from '@lily/api/services/notifications/timezone-scheduler'
import { reminderRecipients } from '@lily/api/services/plants/helpers/reminder-recipients'
import type { users } from '@lily/db/schema'
import { isOnVacation, type PlantOwner } from '@lily/shared'
import { TOPIC_CATEGORY } from '@lily/shared/server'
import { Array, Data, DateTime, Effect, Filter, Option, pipe } from 'effect'

const MIN_DEFERRAL = '5 minutes'

export type GateRow = Pick<
  NotificationRow,
  'id' | 'type' | 'userId' | 'plantId'
>

export type RecipientSettings = Pick<
  typeof users.$inferSelect,
  | 'id'
  | 'status'
  | 'careReminders'
  | 'tips'
  | 'doNotDisturb'
  | 'doNotDisturbStart'
  | 'doNotDisturbEnd'
  | 'timezone'
  | 'vacationStatus'
  | 'vacationStart'
  | 'vacationEnd'
>

export type GateRecipient = Pick<
  RecipientSettings,
  | 'id'
  | 'status'
  | 'careReminders'
  | 'tips'
  | 'vacationStatus'
  | 'vacationStart'
  | 'vacationEnd'
> & {
  readonly dndEnd: Option.Option<Date>
}

export interface PlantFacts {
  readonly diedAt: Date | null
  readonly recipients: ReadonlyArray<string>
  readonly nextCareAt: ReadonlyArray<Date>
}

export type DropReason =
  | 'pending-deletion'
  | 'suspended'
  | 'banned'
  | 'plant-gone'
  | 'not-recipient'
  | 'no-longer-overdue'
  | 'care-reminders-off'
  | 'tips-off'

export type DeferReason = 'vacation' | 'dnd'

export type Decision = Data.TaggedEnum<{
  Send: Record<never, never>
  Drop: { readonly reason: DropReason }
  Defer: { readonly reason: DeferReason; readonly until: Date }
}>

export const Decision = Data.taggedEnum<Decision>()

export const DROP_MESSAGE: Record<DropReason, string> = {
  'pending-deletion': 'Dropping notification - user pending deletion',
  suspended: 'Dropping notification - user suspended',
  banned: 'Dropping notification - user banned',
  'plant-gone': 'Dropping notification - plant dead or missing',
  'not-recipient': 'Dropping care reminder - user no longer the recipient',
  'no-longer-overdue': 'Dropping overdue reminder - plant no longer overdue',
  'care-reminders-off': 'Dropping care reminder - user disabled',
  'tips-off': 'Dropping engagement notification - user disabled tips',
}

export const DEFER_MESSAGE: Record<DeferReason, string> = {
  vacation: 'Deferring notification - user on vacation',
  dnd: 'Deferring notification - user in DND',
}

const plantRule = (
  row: GateRow,
  plants: ReadonlyMap<string, PlantFacts>,
  now: Date
): Option.Option<DropReason> =>
  Option.flatMap(Option.fromNullishOr(row.plantId), (plantId) =>
    pipe(
      Option.fromNullishOr(plants.get(plantId)),
      Option.filter((plant) => plant.diedAt === null),
      Option.match({
        onNone: () => Option.some<DropReason>('plant-gone'),
        onSome: (plant) => {
          if (
            TOPIC_CATEGORY[row.type] === 'care' &&
            !Array.contains(plant.recipients, row.userId)
          ) {
            return Option.some<DropReason>('not-recipient')
          }
          if (
            row.type === 'overdue_reminder' &&
            !Array.some(plant.nextCareAt, (at) => at <= now)
          ) {
            return Option.some<DropReason>('no-longer-overdue')
          }
          return Option.none()
        },
      })
    )
  )

const LOCKED: Record<GateRecipient['status'], Option.Option<DropReason>> = {
  active: Option.none(),
  suspended: Option.some('suspended'),
  banned: Option.some('banned'),
  pending_deletion: Option.some('pending-deletion'),
}

const preferenceRule = (
  row: GateRow,
  user: GateRecipient
): Option.Option<DropReason> => {
  const locked = LOCKED[user.status]
  if (Option.isSome(locked)) return locked
  const category = TOPIC_CATEGORY[row.type]
  if (category === 'care' && !user.careReminders) {
    return Option.some('care-reminders-off')
  }
  if (category === 'engagement' && !user.tips) return Option.some('tips-off')
  return Option.none()
}

const deferRule = (
  row: GateRow,
  user: GateRecipient,
  now: Date
): Option.Option<{ readonly reason: DeferReason; readonly until: Date }> => {
  if (TOPIC_CATEGORY[row.type] !== 'social' && isOnVacation(user, now)) {
    return Option.some({
      reason: 'vacation',
      until: pipe(
        Option.fromNullishOr(user.vacationEnd),
        Option.getOrElse(() => now)
      ),
    })
  }
  return Option.map(user.dndEnd, (until) => ({ reason: 'dnd', until }))
}

const atLeastMinDeferral = (until: Date, now: Date) =>
  DateTime.toDateUtc(
    DateTime.max(
      DateTime.makeUnsafe(until),
      DateTime.addDuration(DateTime.makeUnsafe(now), MIN_DEFERRAL)
    )
  )

export const decide = (
  row: GateRow,
  recipient: Option.Option<GateRecipient>,
  plants: ReadonlyMap<string, PlantFacts>,
  now: Date
): Decision => {
  const dropped = Option.orElse(plantRule(row, plants, now), () =>
    Option.flatMap(recipient, (user) => preferenceRule(row, user))
  )
  if (Option.isSome(dropped)) return Decision.Drop({ reason: dropped.value })
  return pipe(
    Option.flatMap(recipient, (user) => deferRule(row, user, now)),
    Option.match({
      onNone: () => Decision.Send(),
      onSome: ({ reason, until }) =>
        Decision.Defer({ reason, until: atLeastMinDeferral(until, now) }),
    })
  )
}

// One DND decision per user, not per row: a user with a bad stored bound
// warns once per batch however many of their rows it holds.
const dndEnd = (
  user: RecipientSettings,
  now: Date
): Effect.Effect<Option.Option<Date>> =>
  Effect.gen(function* () {
    if (!user.doNotDisturb) return Option.none()
    const bounds = yield* decodeDndBounds(
      user.doNotDisturbStart,
      user.doNotDisturbEnd
    ).pipe(Effect.annotateLogs({ userId: user.id }))
    if (!(yield* isInDoNotDisturbWindow(now, user.timezone, bounds))) {
      return Option.none()
    }
    return Option.some(yield* adjustForDoNotDisturb(now, user.timezone, bounds))
  })

export const loadRecipients = (
  users: ReadonlyArray<RecipientSettings>,
  now: Date
): Effect.Effect<ReadonlyMap<string, GateRecipient>> =>
  Effect.map(
    Effect.forEach(users, (user) =>
      Effect.map(dndEnd(user, now), (end): readonly [string, GateRecipient] => [
        user.id,
        { ...user, dndEnd: end },
      ])
    ),
    (entries) => new Map(entries)
  )

const PLANT_FACT_CONCURRENCY = 10

const ownerKeepsQueuedRowsWhileDelegated = (
  owner: PlantOwner
): ReadonlyArray<string> => (owner._tag === 'User' ? [owner.userId] : [])

export const loadPlantFacts = (
  plants: ReadonlyArray<{
    readonly id: string
    readonly diedAt: Date | null
    readonly owner: PlantOwner
  }>
) =>
  Effect.gen(function* () {
    if (Array.isReadonlyArrayEmpty(plants)) {
      return new Map<string, PlantFacts>()
    }
    const schedules = yield* Effect.flatMap(CareScheduleRepository, (repo) =>
      repo.findByPlantIds(Array.map(plants, (p) => p.id))
    )
    const facts = yield* Effect.forEach(
      plants,
      (plant) =>
        Effect.map(
          plant.diedAt === null
            ? Effect.map(reminderRecipients(plant), (recipients) =>
                Array.union(
                  recipients,
                  ownerKeepsQueuedRowsWhileDelegated(plant.owner)
                )
              )
            : Effect.succeed<ReadonlyArray<string>>([]),
          (recipients) =>
            [
              plant.id,
              {
                diedAt: plant.diedAt,
                recipients,
                nextCareAt: Array.filterMap(
                  schedules,
                  Filter.fromPredicateOption((s) =>
                    s.plantId === plant.id
                      ? Option.fromNullishOr(s.nextCareAt)
                      : Option.none()
                  )
                ),
              },
            ] as const
        ),
      { concurrency: PLANT_FACT_CONCURRENCY }
    )
    return new Map<string, PlantFacts>(facts)
  })
