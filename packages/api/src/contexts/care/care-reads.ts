import { caredForBy } from '@lily/api/repositories/helpers/care-visibility'
import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  plantCareSchedules,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import {
  type CareDay,
  CareDays,
  type CareStatus,
  type CareType,
  careStatus,
  type PlantOwner,
  type PlantSharer,
} from '@lily/shared'
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  Array,
  Context,
  Data,
  DateTime,
  Effect,
  Filter,
  Layer,
  Match,
  Option,
  Order,
  pipe,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export type DueScope = Data.TaggedEnum<{
  Everyone: Record<never, never>
  /** Plants the user owns, plus unmuted plants of `canopyId` when given. */
  CaredForBy: { readonly userId: string; readonly canopyId: string | null }
  Plants: { readonly plantIds: ReadonlyArray<string> }
}>
export const DueScope = Data.taggedEnum<DueScope>()

export type DueWindow = Data.TaggedEnum<{
  Overdue: Record<never, never>
  DueOrOverdue: Record<never, never>
  /** Overdue, due today, and upcoming within `days` care days. */
  Ahead: { readonly days: number }
}>
export const DueWindow = Data.taggedEnum<DueWindow>()

export interface DuePlant {
  readonly id: string
  readonly name: string
  readonly imageUrl: string | null
  readonly owner: PlantOwner
  readonly remindersEnabled: boolean
  readonly dateAdded: Date
  readonly room: {
    readonly id: string
    readonly name: string
    readonly icon: string
  } | null
  readonly sharedBy: PlantSharer | null
}

export interface DueCare {
  readonly plant: DuePlant
  readonly careType: CareType
  readonly frequencyDays: number
  readonly dueDay: CareDay
  readonly today: CareDay
  readonly careTimezone: string
  readonly status: CareStatus
  readonly dueAt: Date
}

export interface ScheduledCare {
  readonly plant: DuePlant
  readonly careType: CareType
  readonly frequencyDays: number
  readonly dueAt: Date
  readonly careTimezone: string
}

export interface DueQuery {
  readonly scope: DueScope
  readonly upTo: DueWindow
}

export class CareReads extends Context.Service<
  CareReads,
  {
    /** Living plants only. Ordered by due day, then by plant. */
    readonly due: (
      query: DueQuery
    ) => Effect.Effect<ReadonlyArray<DueCare>, SqlError>
  }
>()('care/CareReads') {}

const daysAhead = (upTo: DueWindow): number =>
  Match.valueTags(upTo, {
    Overdue: () => 0,
    DueOrOverdue: () => 0,
    Ahead: ({ days }) => days,
  })

const admits = (upTo: DueWindow, status: CareStatus): boolean =>
  Match.valueTags(upTo, {
    Overdue: () => status._tag === 'Overdue',
    DueOrOverdue: () => status._tag !== 'Upcoming',
    Ahead: ({ days }) => status._tag !== 'Upcoming' || status.inDays <= days,
  })

const dueCareOrder: Order.Order<DueCare> = Order.combine(
  Order.mapInput(Order.String, (care: DueCare) => care.dueDay),
  Order.mapInput(Order.String, (care: DueCare) => care.plant.id)
)

export const seeDue = (
  schedules: ReadonlyArray<ScheduledCare>,
  upTo: DueWindow,
  now: DateTime.DateTime
): ReadonlyArray<DueCare> =>
  pipe(
    schedules,
    Array.map((schedule): DueCare => {
      const dueDay = CareDays.of(
        DateTime.makeUnsafe(schedule.dueAt),
        schedule.careTimezone
      )
      const today = CareDays.today(schedule.careTimezone, now)
      return { ...schedule, dueDay, today, status: careStatus(dueDay, today) }
    }),
    Array.filter((care) => admits(upTo, care.status)),
    Array.sort(dueCareOrder)
  )

const LONGEST_LOCAL_DAY_HOURS = 25
const DST_SHIFT_HOURS = 1
// A care admitted by the window is due before the end of a local day that
// started at or before now, give or take one clock change inside the window.
const PRUNE_SLACK_HOURS = LONGEST_LOCAL_DAY_HOURS + DST_SHIFT_HOURS

export const pruneCutoff = (upTo: DueWindow, now: DateTime.DateTime): Date =>
  DateTime.toDateUtc(
    DateTime.add(now, { days: daysAhead(upTo), hours: PRUNE_SLACK_HOURS })
  )

export const makeCareReads = (
  load: (
    scope: DueScope,
    dueBefore: Date
  ) => Effect.Effect<ReadonlyArray<ScheduledCare>, SqlError>
): CareReads['Service'] => ({
  due: Effect.fn('CareReads.due')(function* ({ scope, upTo }: DueQuery) {
    const now = yield* DateTime.now
    const schedules = yield* load(scope, pruneCutoff(upTo, now))
    return seeDue(schedules, upTo, now)
  }),
})

export const CareReadsLive = Layer.effect(
  CareReads,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const ownerUser = alias(users, 'owner_user')
    const sharer = alias(users, 'sharer')

    const inScope = (scope: DueScope) =>
      Match.valueTags(scope, {
        Everyone: () => undefined,
        CaredForBy: ({ userId, canopyId }) => caredForBy(db, userId, canopyId),
        Plants: ({ plantIds }) => inArray(plants.id, [...plantIds]),
      })

    return makeCareReads((scope, dueBefore) =>
      Effect.gen(function* () {
        if (
          scope._tag === 'Plants' &&
          Array.isReadonlyArrayEmpty(scope.plantIds)
        )
          return []
        const rows = yield* db
          .select({
            careType: plantCareSchedules.careType,
            frequencyDays: plantCareSchedules.frequencyDays,
            dueAt: plantCareSchedules.nextCareAt,
            plant: {
              id: plants.id,
              name: plants.name,
              imageUrl: plants.imageUrl,
              userId: plants.userId,
              canopyId: plants.canopyId,
              remindersEnabled: plants.remindersEnabled,
              dateAdded: plants.dateAdded,
            },
            room: { id: rooms.id, name: rooms.name, icon: rooms.icon },
            sharedBy: { id: sharer.id, name: sharer.name, image: sharer.image },
            userTimezone: ownerUser.timezone,
            canopyTimezone: canopies.timezone,
          })
          .from(plantCareSchedules)
          .innerJoin(plants, eq(plantCareSchedules.plantId, plants.id))
          .leftJoin(ownerUser, eq(plants.userId, ownerUser.id))
          .leftJoin(canopies, eq(plants.canopyId, canopies.id))
          .leftJoin(rooms, eq(plants.roomId, rooms.id))
          .leftJoin(
            sharer,
            and(
              eq(plants.createdByUserId, sharer.id),
              isNotNull(plants.canopyId)
            )
          )
          .where(
            and(
              inScope(scope),
              isLivingPlant(),
              isNotNull(plantCareSchedules.nextCareAt),
              lt(plantCareSchedules.nextCareAt, dueBefore)
            )
          )
        return Array.filterMap(
          rows,
          Filter.fromPredicateOption((row) =>
            Option.map(
              Option.fromNullishOr(row.dueAt),
              (dueAt): ScheduledCare => ({
                careType: row.careType,
                frequencyDays: row.frequencyDays,
                dueAt,
                careTimezone: pipe(
                  Option.fromNullishOr(row.canopyTimezone),
                  Option.orElse(() => Option.fromNullishOr(row.userTimezone)),
                  Option.getOrElse(() => 'UTC')
                ),
                plant: {
                  id: row.plant.id,
                  name: row.plant.name,
                  imageUrl: row.plant.imageUrl,
                  owner: ownerOf(row.plant),
                  remindersEnabled: row.plant.remindersEnabled,
                  dateAdded: row.plant.dateAdded,
                  room: row.room,
                  sharedBy: row.sharedBy,
                },
              })
            )
          )
        )
      })
    )
  })
)
