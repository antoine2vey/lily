import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { users } from '@lily/db/schema'
import { reminderRecipients } from '@lily/api/services/plants/helpers/reminder-recipients'
import {
  adjustForDoNotDisturb,
  decodeDndBounds,
  isInDoNotDisturbWindow,
} from '@lily/api/services/notifications/timezone-scheduler'
import { isOnVacation, type PlantOwner } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import { TOPIC_CATEGORY } from '@lily/shared/server'
import {
  Array,
  Data,
  DateTime,
  Effect,
  Filter,
  Option,
  pipe,
} from 'effect'

const MIN_DEFERRAL = '5 minutes'

export type GateRow = Pick<Notification, 'id' | 'type' | 'userId' | 'plantId'>

export type GateRecipient = Pick<
  typeof users.$inferSelect,
  | 'id'
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

export interface PlantFacts {
  readonly diedAt: Date | null
  readonly recipients: ReadonlyArray<string>
  readonly nextCareAt: ReadonlyArray<Date>
}

export type DropReason =
  | 'plant-gone'
  | 'not-recipient'
  | 'no-longer-overdue'
  | 'care-reminders-off'
  | 'tips-off'

export type DeferReason = 'vacation' | 'dnd'

export type Decision = Data.TaggedEnum<{
  Send: {}
  Drop: { readonly reason: DropReason }
  Defer: { readonly reason: DeferReason; readonly until: Date }
}>

export const Decision = Data.taggedEnum<Decision>()

export const DROP_MESSAGE: Record<DropReason, string> = {
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

const preferenceRule = (
  row: GateRow,
  user: GateRecipient
): Option.Option<DropReason> => {
  const category = TOPIC_CATEGORY[row.type]
  if (category === 'care' && !user.careReminders) {
    return Option.some('care-reminders-off')
  }
  if (category === 'engagement' && !user.tips) return Option.some('tips-off')
  return Option.none()
}

const deferRule = (row: GateRow, user: GateRecipient, now: Date) =>
  Effect.gen(function* () {
    if (TOPIC_CATEGORY[row.type] !== 'social' && isOnVacation(user, now)) {
      return Option.some({
        reason: 'vacation' as const,
        until: pipe(
          Option.fromNullishOr(user.vacationEnd),
          Option.getOrElse(() => now)
        ),
      })
    }
    if (!user.doNotDisturb) return Option.none()
    const bounds = yield* decodeDndBounds(
      user.doNotDisturbStart,
      user.doNotDisturbEnd
    ).pipe(Effect.annotateLogs({ userId: user.id }))
    if (!(yield* isInDoNotDisturbWindow(now, user.timezone, bounds))) {
      return Option.none()
    }
    return Option.some({
      reason: 'dnd' as const,
      until: yield* adjustForDoNotDisturb(now, user.timezone, bounds),
    })
  })

const atLeastMinDeferral = (until: Date, now: Date) =>
  DateTime.toDateUtc(
    DateTime.max(
      DateTime.makeUnsafe(until),
      DateTime.addDuration(DateTime.makeUnsafe(now), MIN_DEFERRAL)
    )
  )

// A drop outranks a defer: a row the user would never get is deleted now
// rather than held until DND or vacation ends.
export const decide = (
  row: GateRow,
  recipient: Option.Option<GateRecipient>,
  plants: ReadonlyMap<string, PlantFacts>,
  now: Date
): Effect.Effect<Decision> =>
  Effect.gen(function* () {
    const dropped = Option.orElse(plantRule(row, plants, now), () =>
      Option.flatMap(recipient, (user) => preferenceRule(row, user))
    )
    if (Option.isSome(dropped)) return Decision.Drop({ reason: dropped.value })
    if (Option.isNone(recipient)) return Decision.Send()
    const deferred = yield* deferRule(row, recipient.value, now)
    return Option.match(deferred, {
      onNone: () => Decision.Send(),
      onSome: ({ reason, until }) =>
        Decision.Defer({ reason, until: atLeastMinDeferral(until, now) }),
    })
  })

const PLANT_FACT_CONCURRENCY = 10

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
            ? reminderRecipients(plant)
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
