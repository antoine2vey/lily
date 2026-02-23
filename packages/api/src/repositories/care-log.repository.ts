import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import { careLogs, plants } from '@lily/db'
import { nowAsDate, paginate } from '@lily/shared'
import type {
  CareLog,
  CareLogsListResponse,
  RecentActivitiesListResponse,
  RecentActivity,
} from '@lily/shared/care-log'
import { and, count, desc, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

// Types for repository methods
export interface CreateCareLogData {
  type: 'watering' | 'fertilization'
  notes?: string | undefined
  date?: Date | undefined
  photoUrl?: string | undefined
  plantId: string
}

export interface UpdateCareLogData {
  notes?: string | undefined
  date?: Date | undefined
  photoUrl?: string | undefined
}

export interface FindCareLogsParams {
  plantId: string
  page?: number
  limit?: number
  type?: 'watering' | 'fertilization' | 'all'
}

// Helper to map database row to API CareLog type (null -> undefined)
const mapToCareLog = (row: typeof careLogs.$inferSelect): CareLog => ({
  id: row.id,
  type: row.type,
  notes: Option.getOrUndefined(Option.fromNullable(row.notes)),
  date: row.date,
  photoUrl: Option.getOrUndefined(Option.fromNullable(row.photoUrl)),
  plantId: row.plantId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export interface FindRecentParams {
  userId: string
  limit?: number
}

// Repository service interface
export interface ICareLogRepository {
  readonly findByPlantId: (
    params: FindCareLogsParams
  ) => Effect.Effect<CareLogsListResponse, SqlError>
  readonly findById: (
    id: string,
    plantId: string
  ) => Effect.Effect<CareLog | null, SqlError>
  readonly findRecentByUserId: (
    params: FindRecentParams
  ) => Effect.Effect<RecentActivitiesListResponse, SqlError>
  readonly createMany: (
    data: readonly CreateCareLogData[]
  ) => Effect.Effect<CareLog[], SqlError>
  readonly create: (
    data: CreateCareLogData
  ) => Effect.Effect<CareLog | null, SqlError>
  readonly update: (
    id: string,
    data: UpdateCareLogData
  ) => Effect.Effect<CareLog | null, SqlError>
  readonly delete: (id: string) => Effect.Effect<CareLog | null, SqlError>
  readonly findLatestByPlantAndType: (
    plantId: string,
    type: 'watering' | 'fertilization'
  ) => Effect.Effect<CareLog | null, SqlError>
}

// Tag for dependency injection
export class CareLogRepository extends Context.Tag('CareLogRepository')<
  CareLogRepository,
  ICareLogRepository
>() {}

// Live implementation using PgDrizzle
export const CareLogRepositoryLive = Layer.effect(
  CareLogRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findByPlantId: (params: FindCareLogsParams) =>
        Effect.gen(function* () {
          const { page, limit, offset } = getPaginationParams(params)

          const filterConditions =
            params.type && params.type !== 'all'
              ? and(
                  eq(careLogs.plantId, params.plantId),
                  eq(careLogs.type, params.type)
                )
              : eq(careLogs.plantId, params.plantId)

          const countResult = yield* db
            .select({ value: count() })
            .from(careLogs)
            .where(filterConditions)
          const total = extractCount(countResult)

          const rows = yield* db
            .select()
            .from(careLogs)
            .where(filterConditions)
            .offset(offset)
            .limit(limit)
            .orderBy(desc(careLogs.date))

          return paginate(Array.map(rows, mapToCareLog), total, page, limit)
        }).pipe(Effect.withSpan('CareLogRepository.findByPlantId')),

      findById: (id: string, plantId: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select()
            .from(careLogs)
            .where(and(eq(careLogs.id, id), eq(careLogs.plantId, plantId)))
          return row ? mapToCareLog(row) : null
        }).pipe(Effect.withSpan('CareLogRepository.findById')),

      findRecentByUserId: (params: FindRecentParams) =>
        Effect.gen(function* () {
          const limit = pipe(
            Option.fromNullable(params.limit),
            Option.getOrElse(() => 10)
          )

          const rows = yield* db
            .select({
              id: careLogs.id,
              type: careLogs.type,
              date: careLogs.date,
              notes: careLogs.notes,
              plantId: careLogs.plantId,
              plantName: plants.name,
              plantImageUrl: plants.imageUrl,
            })
            .from(careLogs)
            .innerJoin(plants, eq(careLogs.plantId, plants.id))
            .where(eq(plants.userId, params.userId))
            .orderBy(desc(careLogs.date))
            .limit(limit)

          const items: RecentActivity[] = Array.map(rows, (row) => ({
            id: row.id,
            type: row.type,
            plantId: row.plantId,
            plantName: row.plantName,
            plantImageUrl: Option.getOrUndefined(
              Option.fromNullable(row.plantImageUrl)
            ),
            date: row.date,
            notes: Option.getOrUndefined(Option.fromNullable(row.notes)),
          }))

          return { items }
        }).pipe(Effect.withSpan('CareLogRepository.findRecentByUserId')),

      createMany: (data: readonly CreateCareLogData[]) =>
        Effect.gen(function* () {
          if (data.length === 0) return []
          const values = Array.map(data, (d) => ({
            type: d.type,
            notes: Option.getOrNull(Option.fromNullable(d.notes)),
            date: pipe(
              Option.fromNullable(d.date),
              Option.getOrElse(() => nowAsDate())
            ),
            photoUrl: Option.getOrNull(Option.fromNullable(d.photoUrl)),
            plantId: d.plantId,
          }))
          const rows = yield* db.insert(careLogs).values(values).returning()
          return Array.map(rows, mapToCareLog)
        }).pipe(Effect.withSpan('CareLogRepository.createMany')),

      create: (data: CreateCareLogData) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .insert(careLogs)
            .values({
              type: data.type,
              notes: Option.getOrNull(Option.fromNullable(data.notes)),
              date: pipe(
                Option.fromNullable(data.date),
                Option.getOrElse(() => nowAsDate())
              ),
              photoUrl: Option.getOrNull(Option.fromNullable(data.photoUrl)),
              plantId: data.plantId,
            })
            .returning()
          return row ? mapToCareLog(row) : null
        }).pipe(Effect.withSpan('CareLogRepository.create')),

      update: (id: string, data: UpdateCareLogData) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(careLogs)
            .set({
              notes: Option.getOrNull(Option.fromNullable(data.notes)),
              date: data.date,
              photoUrl: Option.getOrNull(Option.fromNullable(data.photoUrl)),
              updatedAt: nowAsDate(),
            })
            .where(eq(careLogs.id, id))
            .returning()
          return row ? mapToCareLog(row) : null
        }).pipe(Effect.withSpan('CareLogRepository.update')),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .delete(careLogs)
            .where(eq(careLogs.id, id))
            .returning()
          return row ? mapToCareLog(row) : null
        }).pipe(Effect.withSpan('CareLogRepository.delete')),

      findLatestByPlantAndType: (
        plantId: string,
        type: 'watering' | 'fertilization'
      ) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select()
            .from(careLogs)
            .where(and(eq(careLogs.plantId, plantId), eq(careLogs.type, type)))
            .orderBy(desc(careLogs.date))
            .limit(1)
          return row ? mapToCareLog(row) : null
        }).pipe(Effect.withSpan('CareLogRepository.findLatestByPlantAndType')),
    }
  })
)
