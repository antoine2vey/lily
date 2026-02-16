import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import { careDelegations, delegationPlants, plants, users } from '@lily/db'
import { and, count, desc, eq, inArray, lte, or, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Match, pipe } from 'effect'

export interface CreateDelegationData {
  ownerId: string
  caretakerId: string
  startDate: Date
  endDate: Date
  message?: string
}

export interface DelegationRow {
  id: string
  ownerId: string
  caretakerId: string
  status: string
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
  status: string
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
  nextWateringAt: Date | null
  nextFertilizationAt: Date | null
  health: string
}

export interface DelegationPlantRow {
  id: string
  name: string
  imageUrl: string | null
  nextWateringAt: Date | null
  health: string
}

export interface IDelegationRepository {
  readonly create: (
    data: CreateDelegationData
  ) => Effect.Effect<DelegationRow, SqlError>

  readonly findById: (
    id: string
  ) => Effect.Effect<DelegationDetailRow | null, SqlError>

  readonly updateStatus: (
    id: string,
    status: string,
    timestamps?: {
      respondedAt?: Date
      canceledAt?: Date
      completedAt?: Date
    }
  ) => Effect.Effect<void, SqlError>

  readonly findByUser: (params: {
    userId: string
    role: 'owner' | 'caretaker' | 'both'
    status?: string[]
    page: number
    limit: number
  }) => Effect.Effect<{ items: DelegationListRow[]; total: number }, SqlError>

  readonly findActiveDelegationsForCaretaker: (
    caretakerId: string
  ) => Effect.Effect<DelegatedTaskRow[], SqlError>

  readonly findOverlappingDelegations: (params: {
    plantIds: string[]
    startDate: Date
    endDate: Date
    excludeDelegationId?: string
  }) => Effect.Effect<string[], SqlError>

  readonly findAcceptedReadyToActivate: (
    now: Date
  ) => Effect.Effect<DelegationRow[], SqlError>

  readonly findActiveReadyToComplete: (
    now: Date
  ) => Effect.Effect<DelegationRow[], SqlError>

  readonly addPlants: (
    delegationId: string,
    plantIds: string[]
  ) => Effect.Effect<void, SqlError>

  readonly getPlantsByDelegation: (
    delegationId: string
  ) => Effect.Effect<DelegationPlantRow[], SqlError>
}

export class DelegationRepository extends Context.Tag('DelegationRepository')<
  DelegationRepository,
  IDelegationRepository
>() {}

const ownerAlias = sql`owner_user`
const caretakerAlias = sql`caretaker_user`

export const DelegationRepositoryLive = Layer.effect(
  DelegationRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: (data) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .insert(careDelegations)
            .values({
              ownerId: data.ownerId,
              caretakerId: data.caretakerId,
              startDate: data.startDate,
              endDate: data.endDate,
              message: data.message ?? null,
            })
            .returning()
          return row as DelegationRow
        }).pipe(Effect.withSpan('DelegationRepository.create')),

      findById: (id) =>
        Effect.gen(function* () {
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
              nextWateringAt: plants.nextWateringAt,
              health: plants.health,
            })
            .from(delegationPlants)
            .innerJoin(plants, eq(delegationPlants.plantId, plants.id))
            .where(eq(delegationPlants.delegationId, id))

          return {
            ...row,
            plants: plantRows as DelegationPlantRow[],
          } as DelegationDetailRow
        }).pipe(Effect.withSpan('DelegationRepository.findById')),

      updateStatus: (id, status, timestamps) =>
        Effect.gen(function* () {
          yield* db
            .update(careDelegations)
            .set({
              status: status as typeof careDelegations.$inferInsert.status,
              ...(timestamps?.respondedAt
                ? { respondedAt: timestamps.respondedAt }
                : {}),
              ...(timestamps?.canceledAt
                ? { canceledAt: timestamps.canceledAt }
                : {}),
              ...(timestamps?.completedAt
                ? { completedAt: timestamps.completedAt }
                : {}),
            })
            .where(eq(careDelegations.id, id))
        }).pipe(Effect.withSpan('DelegationRepository.updateStatus')),

      findByUser: (params) =>
        Effect.gen(function* () {
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
                sql<number>`(SELECT COUNT(*) FROM delegation_plants WHERE delegation_id = ${careDelegations.id})`.as(
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
        }).pipe(Effect.withSpan('DelegationRepository.findByUser')),

      findActiveDelegationsForCaretaker: (caretakerId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({
              delegationId: careDelegations.id,
              plantId: plants.id,
              plantName: plants.name,
              plantImage: plants.imageUrl,
              ownerName: users.name,
              nextWateringAt: plants.nextWateringAt,
              nextFertilizationAt: plants.nextFertilizationAt,
              health: plants.health,
            })
            .from(careDelegations)
            .innerJoin(
              delegationPlants,
              eq(careDelegations.id, delegationPlants.delegationId)
            )
            .innerJoin(plants, eq(delegationPlants.plantId, plants.id))
            .innerJoin(users, eq(careDelegations.ownerId, users.id))
            .where(
              and(
                eq(careDelegations.caretakerId, caretakerId),
                eq(careDelegations.status, 'active')
              )
            )
            .orderBy(plants.nextWateringAt)

          return rows as DelegatedTaskRow[]
        }).pipe(
          Effect.withSpan(
            'DelegationRepository.findActiveDelegationsForCaretaker'
          )
        ),

      findOverlappingDelegations: (params) =>
        Effect.gen(function* () {
          if (params.plantIds.length === 0) return []

          const conditions = [
            inArray(delegationPlants.plantId, params.plantIds),
            inArray(careDelegations.status, ['pending', 'accepted', 'active']),
            sql`${careDelegations.startDate} < ${params.endDate}`,
            sql`${careDelegations.endDate} > ${params.startDate}`,
          ]

          if (params.excludeDelegationId) {
            conditions.push(
              sql`${careDelegations.id} != ${params.excludeDelegationId}`
            )
          }

          const rows = yield* db
            .selectDistinct({ plantId: delegationPlants.plantId })
            .from(delegationPlants)
            .innerJoin(
              careDelegations,
              eq(delegationPlants.delegationId, careDelegations.id)
            )
            .where(and(...conditions))

          return Array.map(rows, (r) => r.plantId)
        }).pipe(
          Effect.withSpan('DelegationRepository.findOverlappingDelegations')
        ),

      findAcceptedReadyToActivate: (now) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(careDelegations)
            .where(
              and(
                eq(careDelegations.status, 'accepted'),
                lte(careDelegations.startDate, now)
              )
            )
          return rows as DelegationRow[]
        }).pipe(
          Effect.withSpan('DelegationRepository.findAcceptedReadyToActivate')
        ),

      findActiveReadyToComplete: (now) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(careDelegations)
            .where(
              and(
                eq(careDelegations.status, 'active'),
                lte(careDelegations.endDate, now)
              )
            )
          return rows as DelegationRow[]
        }).pipe(
          Effect.withSpan('DelegationRepository.findActiveReadyToComplete')
        ),

      addPlants: (delegationId, plantIds) =>
        Effect.gen(function* () {
          if (plantIds.length === 0) return
          const values = Array.map(plantIds, (plantId) => ({
            delegationId,
            plantId,
          }))
          yield* db.insert(delegationPlants).values(values)
        }).pipe(Effect.withSpan('DelegationRepository.addPlants')),

      getPlantsByDelegation: (delegationId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({
              id: plants.id,
              name: plants.name,
              imageUrl: plants.imageUrl,
              nextWateringAt: plants.nextWateringAt,
              health: plants.health,
            })
            .from(delegationPlants)
            .innerJoin(plants, eq(delegationPlants.plantId, plants.id))
            .where(eq(delegationPlants.delegationId, delegationId))

          return rows as DelegationPlantRow[]
        }).pipe(Effect.withSpan('DelegationRepository.getPlantsByDelegation')),
    }
  })
)
