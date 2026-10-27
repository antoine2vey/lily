import { caredForBy } from '@lily/api/repositories/helpers/care-visibility'
import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
import { hasUserOwner } from '@lily/api/repositories/helpers/user-owner'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopyMembers,
  canopyPlantMutes,
  plantCareSchedules,
  plants,
  rooms,
} from '@lily/db/schema'
import {
  type CanopyId,
  type CareType,
  earliestOverdueDate,
  nowAsDate,
  type OverduePlant,
  type PlantOwner,
} from '@lily/shared'
import { and, asc, eq, isNotNull, isNull, lte } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// Types
export type CareScheduleRow = typeof plantCareSchedules.$inferSelect
export type { CareType } from '@lily/shared'

export interface ScheduleWithPlant {
  schedule: CareScheduleRow
  plant: {
    id: string
    name: string
    imageUrl: string | null
    room: {
      id: string
      name: string
      icon: string
    } | null
  }
}

export interface OwnerScheduleRow {
  schedule: CareScheduleRow
  plant: {
    id: string
    owner: PlantOwner
    remindersEnabled: boolean
  }
}

export type OverdueRecipientPlant = OverduePlant & { owner: PlantOwner }

export interface UpsertScheduleData {
  frequencyDays: number
  lastCareAt?: Date | null
  nextCareAt?: Date | null
}

// Repository interface
export interface ICareScheduleRepository {
  readonly findByPlantAndType: (
    plantId: string,
    careType: CareType
  ) => Effect.Effect<CareScheduleRow | null, SqlError>
  readonly findByPlant: (
    plantId: string
  ) => Effect.Effect<Array<CareScheduleRow>, SqlError>
  readonly findPendingByUser: (
    userId: string,
    cutoff: Date,
    includeCanopy: boolean
  ) => Effect.Effect<Array<ScheduleWithPlant>, SqlError>
  readonly findOverdueByUser: () => Effect.Effect<
    Record<string, Array<OverdueRecipientPlant>>,
    SqlError
  >
  readonly findByOwnerWithPlant: (
    userId: string
  ) => Effect.Effect<Array<OwnerScheduleRow>, SqlError>
  readonly upsert: (
    plantId: string,
    careType: CareType,
    data: UpsertScheduleData
  ) => Effect.Effect<CareScheduleRow, SqlError>
  readonly updateByPlantAndType: (
    plantId: string,
    careType: CareType,
    data: Partial<
      Pick<CareScheduleRow, 'frequencyDays' | 'lastCareAt' | 'nextCareAt'>
    >
  ) => Effect.Effect<CareScheduleRow | null, SqlError>
  readonly deleteByPlantAndType: (
    plantId: string,
    careType: CareType
  ) => Effect.Effect<void, SqlError>
}

// Tag for dependency injection
export class CareScheduleRepository extends Context.Service<
  CareScheduleRepository,
  ICareScheduleRepository
>()('CareScheduleRepository') {}

// Shared room selection shape for joins
const roomSelect = {
  id: rooms.id,
  name: rooms.name,
  icon: rooms.icon,
}

// Live implementation
export const CareScheduleRepositoryLive = Layer.effect(
  CareScheduleRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findByPlantAndType: Effect.fn(
        'CareScheduleRepository.findByPlantAndType'
      )(function* (plantId: string, careType: CareType) {
        const [row] = yield* db
          .select()
          .from(plantCareSchedules)
          .where(
            and(
              eq(plantCareSchedules.plantId, plantId),
              eq(plantCareSchedules.careType, careType)
            )
          )
        return pipe(Option.fromNullishOr(row), Option.getOrNull)
      }),

      findByPlant: Effect.fn('CareScheduleRepository.findByPlant')(function* (
        plantId: string
      ) {
        const rows = yield* db
          .select()
          .from(plantCareSchedules)
          .where(eq(plantCareSchedules.plantId, plantId))
        return rows
      }),

      findPendingByUser: Effect.fn('CareScheduleRepository.findPendingByUser')(
        function* (userId: string, cutoff: Date, includeCanopy: boolean) {
          const rows = yield* db
            .select({
              schedule: plantCareSchedules,
              plant: {
                id: plants.id,
                name: plants.name,
                imageUrl: plants.imageUrl,
              },
              room: roomSelect,
            })
            .from(plantCareSchedules)
            .innerJoin(plants, eq(plantCareSchedules.plantId, plants.id))
            .leftJoin(rooms, eq(plants.roomId, rooms.id))
            .where(
              and(
                caredForBy(db, userId, includeCanopy),
                isLivingPlant(),
                isNotNull(plantCareSchedules.nextCareAt),
                lte(plantCareSchedules.nextCareAt, cutoff)
              )
            )

          return Array.map(rows, (row) => ({
            schedule: row.schedule,
            plant: {
              id: row.plant.id,
              name: row.plant.name,
              imageUrl: row.plant.imageUrl,
              room: row.room,
            },
          }))
        }
      ),

      findOverdueByUser: Effect.fn('CareScheduleRepository.findOverdueByUser')(
        function* () {
          const now = nowAsDate()
          const overdue = and(
            isLivingPlant(),
            isNotNull(plantCareSchedules.nextCareAt),
            lte(plantCareSchedules.nextCareAt, now)
          )
          const personal = yield* db
            .select({
              plantId: plants.id,
              plantName: plants.name,
              userId: plants.userId,
              nextCareAt: plantCareSchedules.nextCareAt,
              dateAdded: plants.dateAdded,
            })
            .from(plantCareSchedules)
            .innerJoin(plants, eq(plantCareSchedules.plantId, plants.id))
            .where(and(overdue, isNotNull(plants.userId)))
            .orderBy(asc(plants.userId))

          const shared = yield* db
            .select({
              plantId: plants.id,
              plantName: plants.name,
              userId: canopyMembers.userId,
              canopyId: canopyMembers.canopyId,
              nextCareAt: plantCareSchedules.nextCareAt,
              dateAdded: plants.dateAdded,
            })
            .from(plantCareSchedules)
            .innerJoin(plants, eq(plantCareSchedules.plantId, plants.id))
            .innerJoin(
              canopyMembers,
              eq(plants.canopyId, canopyMembers.canopyId)
            )
            .leftJoin(
              canopyPlantMutes,
              and(
                eq(canopyPlantMutes.userId, canopyMembers.userId),
                eq(canopyPlantMutes.plantId, plants.id)
              )
            )
            .where(and(overdue, isNull(canopyPlantMutes.userId)))
            .orderBy(asc(canopyMembers.userId))

          const addressed = Array.appendAll(
            Array.map(Array.filter(personal, hasUserOwner), (r) => ({
              ...r,
              owner: { _tag: 'User', userId: r.userId } as PlantOwner,
            })),
            Array.map(shared, (r) => ({
              ...r,
              owner: {
                _tag: 'Canopy',
                canopyId: r.canopyId as CanopyId,
              } as PlantOwner,
            }))
          )
          const byRecipientPlant = Array.groupBy(
            addressed,
            (r) => `${r.userId}:${r.plantId}`
          )
          const mapped = Array.map(
            Array.fromRecord(byRecipientPlant),
            ([, schedules]): OverdueRecipientPlant => {
              // biome-ignore lint/style/noNonNullAssertion: groupBy guarantees non-empty groups
              const first = schedules[0]!
              return {
                id: first.plantId,
                name: first.plantName,
                userId: first.userId,
                owner: first.owner,
                dateAdded: first.dateAdded,
                overdueAt: earliestOverdueDate(
                  Array.map(schedules, (s) => s.nextCareAt),
                  now
                ),
              }
            }
          )

          return Array.groupBy(mapped, (p) => p.userId)
        }
      ),

      findByOwnerWithPlant: Effect.fn(
        'CareScheduleRepository.findByOwnerWithPlant'
      )(function* (userId: string) {
        const rows = yield* db
          .select({
            schedule: plantCareSchedules,
            plant: {
              id: plants.id,
              userId: plants.userId,
              canopyId: plants.canopyId,
              remindersEnabled: plants.remindersEnabled,
            },
          })
          .from(plantCareSchedules)
          .innerJoin(plants, eq(plantCareSchedules.plantId, plants.id))
          .where(and(caredForBy(db, userId, true), isLivingPlant()))
        return Array.map(rows, (row) => ({
          schedule: row.schedule,
          plant: {
            id: row.plant.id,
            owner: ownerOf(row.plant),
            remindersEnabled: row.plant.remindersEnabled,
          },
        }))
      }),

      upsert: Effect.fn('CareScheduleRepository.upsert')(function* (
        plantId: string,
        careType: CareType,
        data: UpsertScheduleData
      ) {
        const [row] = yield* db
          .insert(plantCareSchedules)
          .values({
            plantId,
            careType,
            frequencyDays: data.frequencyDays,
            lastCareAt: pipe(
              Option.fromNullishOr(data.lastCareAt),
              Option.getOrNull
            ),
            nextCareAt: pipe(
              Option.fromNullishOr(data.nextCareAt),
              Option.getOrNull
            ),
          })
          .onConflictDoUpdate({
            target: [plantCareSchedules.plantId, plantCareSchedules.careType],
            set: {
              frequencyDays: data.frequencyDays,
              ...(data.lastCareAt !== undefined
                ? { lastCareAt: data.lastCareAt }
                : {}),
              ...(data.nextCareAt !== undefined
                ? { nextCareAt: data.nextCareAt }
                : {}),
            },
          })
          .returning()
        // biome-ignore lint/style/noNonNullAssertion: INSERT ... RETURNING always returns a row
        return row!
      }),

      updateByPlantAndType: Effect.fn(
        'CareScheduleRepository.updateByPlantAndType'
      )(function* (
        plantId: string,
        careType: CareType,
        data: Partial<
          Pick<CareScheduleRow, 'frequencyDays' | 'lastCareAt' | 'nextCareAt'>
        >
      ) {
        const [row] = yield* db
          .update(plantCareSchedules)
          .set(data)
          .where(
            and(
              eq(plantCareSchedules.plantId, plantId),
              eq(plantCareSchedules.careType, careType)
            )
          )
          .returning()
        return pipe(Option.fromNullishOr(row), Option.getOrNull)
      }),

      deleteByPlantAndType: Effect.fn(
        'CareScheduleRepository.deleteByPlantAndType'
      )(function* (plantId: string, careType: CareType) {
        yield* db
          .delete(plantCareSchedules)
          .where(
            and(
              eq(plantCareSchedules.plantId, plantId),
              eq(plantCareSchedules.careType, careType)
            )
          )
      }),
    }
  })
)
