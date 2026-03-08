import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plantCareSchedules, plants, rooms } from '@lily/db/schema'
import {
  type CareType,
  earliestOverdueDate,
  nowAsDate,
  type OverduePlant,
} from '@lily/shared'
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

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
    cutoff: Date
  ) => Effect.Effect<Array<ScheduleWithPlant>, SqlError>
  readonly findOverdueByUser: () => Effect.Effect<
    Record<string, Array<OverduePlant>>,
    SqlError
  >
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
export class CareScheduleRepository extends Context.Tag(
  'CareScheduleRepository'
)<CareScheduleRepository, ICareScheduleRepository>() {}

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
      findByPlantAndType: (plantId: string, careType: CareType) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select()
            .from(plantCareSchedules)
            .where(
              and(
                eq(plantCareSchedules.plantId, plantId),
                eq(plantCareSchedules.careType, careType)
              )
            )
          return pipe(Option.fromNullable(row), Option.getOrNull)
        }).pipe(Effect.withSpan('CareScheduleRepository.findByPlantAndType')),

      findByPlant: (plantId: string) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(plantCareSchedules)
            .where(eq(plantCareSchedules.plantId, plantId))
          return rows
        }).pipe(Effect.withSpan('CareScheduleRepository.findByPlant')),

      findPendingByUser: (userId: string, cutoff: Date) =>
        Effect.gen(function* () {
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
                eq(plants.userId, userId),
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
        }).pipe(Effect.withSpan('CareScheduleRepository.findPendingByUser')),

      findOverdueByUser: () =>
        Effect.gen(function* () {
          const now = nowAsDate()
          const rows = yield* db
            .select({
              scheduleId: plantCareSchedules.id,
              plantId: plants.id,
              plantName: plants.name,
              userId: plants.userId,
              careType: plantCareSchedules.careType,
              nextCareAt: plantCareSchedules.nextCareAt,
            })
            .from(plantCareSchedules)
            .innerJoin(plants, eq(plantCareSchedules.plantId, plants.id))
            .where(
              and(
                isNotNull(plantCareSchedules.nextCareAt),
                lte(plantCareSchedules.nextCareAt, now)
              )
            )
            .orderBy(asc(plants.userId))

          // Group by plant first to deduplicate (one plant can have multiple overdue schedules)
          const byPlant = Array.groupBy(rows, (r) => r.plantId)

          const mapped = pipe(
            Array.map(Array.fromRecord(byPlant), ([, schedules]) => {
              // biome-ignore lint/style/noNonNullAssertion: groupBy guarantees non-empty groups
              const first = schedules[0]!
              return {
                id: first.plantId,
                name: first.plantName,
                userId: first.userId,
                overdueAt: earliestOverdueDate(
                  Array.map(schedules, (s) => s.nextCareAt),
                  now
                ),
              }
            })
          )

          return Array.groupBy(mapped, (p) => p.userId)
        }).pipe(Effect.withSpan('CareScheduleRepository.findOverdueByUser')),

      upsert: (plantId: string, careType: CareType, data: UpsertScheduleData) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .insert(plantCareSchedules)
            .values({
              plantId,
              careType,
              frequencyDays: data.frequencyDays,
              lastCareAt: pipe(
                Option.fromNullable(data.lastCareAt),
                Option.getOrNull
              ),
              nextCareAt: pipe(
                Option.fromNullable(data.nextCareAt),
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
        }).pipe(Effect.withSpan('CareScheduleRepository.upsert')),

      updateByPlantAndType: (
        plantId: string,
        careType: CareType,
        data: Partial<
          Pick<CareScheduleRow, 'frequencyDays' | 'lastCareAt' | 'nextCareAt'>
        >
      ) =>
        Effect.gen(function* () {
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
          return pipe(Option.fromNullable(row), Option.getOrNull)
        }).pipe(Effect.withSpan('CareScheduleRepository.updateByPlantAndType')),

      deleteByPlantAndType: (plantId: string, careType: CareType) =>
        Effect.gen(function* () {
          yield* db
            .delete(plantCareSchedules)
            .where(
              and(
                eq(plantCareSchedules.plantId, plantId),
                eq(plantCareSchedules.careType, careType)
              )
            )
        }).pipe(Effect.withSpan('CareScheduleRepository.deleteByPlantAndType')),
    }
  })
)
