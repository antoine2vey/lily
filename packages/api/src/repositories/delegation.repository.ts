import {
  type PlantCondition,
  type StoredSchedule,
  seeLivingPlantCare,
} from '@lily/api/contexts/care'
import { careTimezoneSql } from '@lily/api/repositories/helpers/care-timezone'
import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import { tending } from '@lily/api/repositories/helpers/tending'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  careDelegations,
  delegationPlants,
  plantCareSchedules,
  plants,
  users,
} from '@lily/db/schema'
import {
  CareDay,
  type CareType,
  type DelegationStatus,
  type PlantCareSchedule,
} from '@lily/shared'
import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm'
import {
  Array,
  Context,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  Order,
  pipe,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface DelegationRow {
  id: string
  ownerId: string
  caretakerId: string
  status: DelegationStatus
  message: string | null
  startDate: Date
  endDate: Date
  respondedAt: Date | null
  canceledAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface DelegationDetailRow extends DelegationRow {
  ownerName: string | null
  ownerImage: string | null
  caretakerName: string | null
  caretakerImage: string | null
  plants: DelegationPlantRow[]
}

export interface DelegationListRow {
  id: string
  ownerId: string
  ownerName: string | null
  ownerImage: string | null
  caretakerId: string
  caretakerName: string | null
  caretakerImage: string | null
  status: DelegationStatus
  startDate: Date
  endDate: Date
  plantCount: number
  createdAt: Date
}

export interface DelegatedTaskRow {
  delegationId: string
  plantId: string
  plantName: string
  plantImage: string | null
  ownerName: string | null
  ownerImage: string | null
  schedules: PlantCareSchedule[]
  health: string
}

export interface DelegationPlantRow {
  id: string
  name: string
  imageUrl: string | null
  schedules: PlantCareSchedule[]
  health: string
}

export interface IDelegationRepository {
  readonly findById: (
    id: string
  ) => Effect.Effect<DelegationDetailRow | null, SqlError>

  readonly findByUser: (params: {
    userId: string
    role: 'owner' | 'caretaker' | 'both'
    status?: string[] | undefined
    page: number
    limit: number
  }) => Effect.Effect<{ items: DelegationListRow[]; total: number }, SqlError>

  readonly findActiveDelegationsForCaretaker: (
    caretakerId: string
  ) => Effect.Effect<DelegatedTaskRow[], SqlError>

  readonly tends: (
    userId: string,
    plantId: string
  ) => Effect.Effect<boolean, SqlError>

  readonly findActiveCaretakersForPlants: (
    plantIds: ReadonlyArray<string>
  ) => Effect.Effect<
    ReadonlyArray<{ readonly plantId: string; readonly caretakerId: string }>,
    SqlError
  >

  readonly hasOpenDelegationForPlant: (
    plantId: string
  ) => Effect.Effect<boolean, SqlError>
}

export class DelegationRepository extends Context.Service<
  DelegationRepository,
  IDelegationRepository
>()('DelegationRepository') {}

const OPEN_STATUSES: DelegationStatus[] = ['pending', 'accepted', 'active']

const ownerAlias = sql`owner_user`
const caretakerAlias = sql`caretaker_user`

const scheduleColumns = {
  careType: plantCareSchedules.careType,
  frequencyDays: plantCareSchedules.frequencyDays,
  lastCareAt: plantCareSchedules.lastCareAt,
  nextCareAt: plantCareSchedules.nextCareAt,
  dueDay: plantCareSchedules.dueDay,
}

type ScheduleJoinRow = {
  careType: CareType | null
  frequencyDays: number | null
  lastCareAt: Date | null
  nextCareAt: Date | null
  dueDay: string | null
}

const toScheduleRef = (r: ScheduleJoinRow): StoredSchedule | null =>
  r.careType !== null &&
  r.frequencyDays !== null &&
  r.nextCareAt !== null &&
  r.dueDay !== null
    ? {
        careType: r.careType,
        frequencyDays: r.frequencyDays,
        lastCareAt: r.lastCareAt,
        nextCareAt: r.nextCareAt,
        dueDay: CareDay.make(r.dueDay),
      }
    : null

function groupWithSchedules<
  R extends ScheduleJoinRow,
  T extends { schedules: StoredSchedule[] },
>(rows: readonly R[], getKey: (r: R) => string, init: (r: R) => T): T[] {
  const grouped = new Map<string, T>()
  Array.forEach(rows, (r) => {
    const key = getKey(r)
    const existing = grouped.get(key) ?? init(r)
    const schedule = toScheduleRef(r)
    if (schedule) existing.schedules.push(schedule)
    grouped.set(key, existing)
  })
  return [...grouped.values()]
}

type UnseenCare = {
  schedules: StoredSchedule[]
  health: PlantCondition
  careTimezone: string
}

const withCareSeen = <T extends UnseenCare>(
  { careTimezone, ...plant }: T,
  now: DateTime.DateTime
) => {
  const care = seeLivingPlantCare(
    plant.health,
    plant.schedules,
    careTimezone,
    now
  )
  return { ...plant, schedules: care.schedules, health: care.health }
}

const groupPlantRows = (
  rows: readonly (ScheduleJoinRow & {
    id: string
    name: string
    imageUrl: string | null
    health: PlantCondition
    careTimezone: string
  })[],
  now: DateTime.DateTime
): DelegationPlantRow[] =>
  Array.map(
    groupWithSchedules(
      rows,
      (r) => r.id,
      (r) => ({
        id: r.id,
        name: r.name,
        imageUrl: r.imageUrl,
        health: r.health,
        careTimezone: r.careTimezone,
        schedules: [] as StoredSchedule[],
      })
    ),
    (plant) => withCareSeen(plant, now)
  )

export const DelegationRepositoryLive = Layer.effect(
  DelegationRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findById: Effect.fn('DelegationRepository.findById')(function* (id) {
        const [row] = yield* db
          .select({
            id: careDelegations.id,
            ownerId: careDelegations.ownerId,
            caretakerId: careDelegations.caretakerId,
            status: careDelegations.status,
            message: careDelegations.message,
            startDate: careDelegations.startDate,
            endDate: careDelegations.endDate,
            respondedAt: careDelegations.respondedAt,
            canceledAt: careDelegations.canceledAt,
            completedAt: careDelegations.completedAt,
            createdAt: careDelegations.createdAt,
            updatedAt: careDelegations.updatedAt,
            ownerName: sql<string | null>`${ownerAlias}.name`,
            ownerImage: sql<string | null>`${ownerAlias}.image`,
            caretakerName: sql<string | null>`${caretakerAlias}.name`,
            caretakerImage: sql<string | null>`${caretakerAlias}.image`,
          })
          .from(careDelegations)
          .leftJoin(
            sql`${users} AS ${ownerAlias}`,
            sql`${careDelegations.ownerId} = ${ownerAlias}.id`
          )
          .leftJoin(
            sql`${users} AS ${caretakerAlias}`,
            sql`${careDelegations.caretakerId} = ${caretakerAlias}.id`
          )
          .where(eq(careDelegations.id, id))

        if (!row) return null

        const plantRows = yield* db
          .select({
            id: plants.id,
            name: plants.name,
            imageUrl: plants.imageUrl,
            health: plants.health,
            careTimezone: careTimezoneSql,
            ...scheduleColumns,
          })
          .from(delegationPlants)
          .innerJoin(plants, eq(delegationPlants.plantId, plants.id))
          .leftJoin(
            plantCareSchedules,
            eq(plants.id, plantCareSchedules.plantId)
          )
          .where(and(eq(delegationPlants.delegationId, id), isLivingPlant()))

        return {
          ...row,
          plants: groupPlantRows(plantRows, yield* DateTime.now),
        } as DelegationDetailRow
      }),

      findByUser: Effect.fn('DelegationRepository.findByUser')(
        function* (params) {
          const { offset, limit } = getPaginationParams({
            page: params.page,
            limit: params.limit,
          })

          const roleCondition = pipe(
            Match.value(params.role),
            Match.when('owner', () =>
              eq(careDelegations.ownerId, params.userId)
            ),
            Match.when('caretaker', () =>
              eq(careDelegations.caretakerId, params.userId)
            ),
            Match.when('both', () =>
              or(
                eq(careDelegations.ownerId, params.userId),
                eq(careDelegations.caretakerId, params.userId)
              )
            ),
            Match.exhaustive
          )

          type DelegationStatusValue =
            typeof careDelegations.$inferSelect.status
          const conditions = [roleCondition]
          if (params.status && params.status.length > 0) {
            conditions.push(
              inArray(
                careDelegations.status,
                params.status as DelegationStatusValue[]
              )
            )
          }

          const whereClause = and(...conditions)

          const countResult = yield* db
            .select({ value: count() })
            .from(careDelegations)
            .where(whereClause)

          const total = extractCount(countResult)

          const rows = yield* db
            .select({
              id: careDelegations.id,
              ownerId: careDelegations.ownerId,
              ownerName: sql<string | null>`${ownerAlias}.name`,
              ownerImage: sql<string | null>`${ownerAlias}.image`,
              caretakerId: careDelegations.caretakerId,
              caretakerName: sql<string | null>`${caretakerAlias}.name`,
              caretakerImage: sql<string | null>`${caretakerAlias}.image`,
              status: careDelegations.status,
              startDate: careDelegations.startDate,
              endDate: careDelegations.endDate,
              plantCount:
                sql<number>`(SELECT COUNT(*)::int FROM delegation_plants WHERE delegation_id = ${careDelegations.id})`.as(
                  'plant_count'
                ),
              createdAt: careDelegations.createdAt,
            })
            .from(careDelegations)
            .leftJoin(
              sql`${users} AS ${ownerAlias}`,
              sql`${careDelegations.ownerId} = ${ownerAlias}.id`
            )
            .leftJoin(
              sql`${users} AS ${caretakerAlias}`,
              sql`${careDelegations.caretakerId} = ${caretakerAlias}.id`
            )
            .where(whereClause)
            .orderBy(desc(careDelegations.createdAt))
            .offset(offset)
            .limit(limit)

          return {
            items: rows as unknown as DelegationListRow[],
            total,
          }
        }
      ),

      findActiveDelegationsForCaretaker: Effect.fn(
        'DelegationRepository.findActiveDelegationsForCaretaker'
      )(function* (caretakerId) {
        const rows = yield* db
          .select({
            delegationId: careDelegations.id,
            plantId: plants.id,
            plantName: plants.name,
            plantImage: plants.imageUrl,
            ownerName: users.name,
            ownerImage: users.image,
            health: plants.health,
            careTimezone: careTimezoneSql,
            ...scheduleColumns,
          })
          .from(careDelegations)
          .innerJoin(
            delegationPlants,
            eq(careDelegations.id, delegationPlants.delegationId)
          )
          .innerJoin(plants, eq(delegationPlants.plantId, plants.id))
          .innerJoin(users, eq(careDelegations.ownerId, users.id))
          .leftJoin(
            plantCareSchedules,
            eq(plants.id, plantCareSchedules.plantId)
          )
          .where(
            and(
              eq(careDelegations.caretakerId, caretakerId),
              tending(),
              isLivingPlant()
            )
          )

        const tasks = groupWithSchedules(
          rows,
          (r) => `${r.delegationId}:${r.plantId}`,
          (r) => ({
            delegationId: r.delegationId,
            plantId: r.plantId,
            plantName: r.plantName,
            plantImage: r.plantImage,
            ownerName: r.ownerName,
            ownerImage: r.ownerImage,
            health: r.health,
            careTimezone: r.careTimezone,
            schedules: [] as StoredSchedule[],
          })
        )
        const now = yield* DateTime.now

        const seen = Array.map(tasks, (task) => withCareSeen(task, now))
        return Array.sortWith(
          seen,
          (t) =>
            pipe(
              Array.findFirst(t.schedules, (s) => s.careType === 'watering'),
              Option.map((s) => s.nextCareAt.getTime()),
              Option.getOrElse(() => Number.MAX_SAFE_INTEGER)
            ),
          Order.Number
        )
      }),

      hasOpenDelegationForPlant: Effect.fn(
        'DelegationRepository.hasOpenDelegationForPlant'
      )(function* (plantId: string) {
        const rows = yield* db
          .select({ id: careDelegations.id })
          .from(careDelegations)
          .innerJoin(
            delegationPlants,
            eq(careDelegations.id, delegationPlants.delegationId)
          )
          .where(
            and(
              eq(delegationPlants.plantId, plantId),
              inArray(careDelegations.status, OPEN_STATUSES)
            )
          )
          .limit(1)
        return Array.isArrayNonEmpty(rows)
      }),

      tends: Effect.fn('DelegationRepository.tends')(
        function* (userId, plantId) {
          const rows = yield* db
            .select({ id: careDelegations.id })
            .from(careDelegations)
            .innerJoin(
              delegationPlants,
              eq(careDelegations.id, delegationPlants.delegationId)
            )
            .where(
              and(
                eq(careDelegations.caretakerId, userId),
                eq(delegationPlants.plantId, plantId),
                tending()
              )
            )
            .limit(1)

          return rows.length > 0
        }
      ),

      findActiveCaretakersForPlants: Effect.fn(
        'DelegationRepository.findActiveCaretakersForPlants'
      )(function* (plantIds) {
        if (Array.isReadonlyArrayEmpty(plantIds)) return []
        return yield* db
          .select({
            plantId: delegationPlants.plantId,
            caretakerId: careDelegations.caretakerId,
          })
          .from(careDelegations)
          .innerJoin(
            delegationPlants,
            eq(careDelegations.id, delegationPlants.delegationId)
          )
          .where(
            and(inArray(delegationPlants.plantId, [...plantIds]), tending())
          )
      }),
    }
  })
)
