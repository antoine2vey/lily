import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { careLogs } from '@lily/db'
import type { CareLog } from '@lily/shared/care-log'
import { and, desc, eq } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

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

// Helper to map database row to API CareLog type (null -> undefined)
const mapToCareLog = (row: typeof careLogs.$inferSelect): CareLog => ({
  id: row.id,
  type: row.type,
  notes: row.notes ?? undefined,
  date: row.date,
  photoUrl: row.photoUrl ?? undefined,
  plantId: row.plantId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

// Repository service interface
export interface ICareLogRepository {
  readonly findByPlantId: (
    plantId: string,
    type?: 'watering' | 'fertilization'
  ) => Effect.Effect<CareLog[], SqlError>
  readonly findById: (
    id: string,
    plantId: string
  ) => Effect.Effect<CareLog | null, SqlError>
  readonly create: (
    data: CreateCareLogData
  ) => Effect.Effect<CareLog | null, SqlError>
  readonly update: (
    id: string,
    data: UpdateCareLogData
  ) => Effect.Effect<CareLog | null, SqlError>
  readonly delete: (id: string) => Effect.Effect<CareLog | null, SqlError>
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
      findByPlantId: (plantId: string, type?: 'watering' | 'fertilization') =>
        Effect.gen(function* () {
          if (type) {
            const rows = yield* db
              .select()
              .from(careLogs)
              .where(and(eq(careLogs.plantId, plantId), eq(careLogs.type, type)))
              .orderBy(desc(careLogs.date))
            return rows.map(mapToCareLog)
          }
          const rows = yield* db
            .select()
            .from(careLogs)
            .where(eq(careLogs.plantId, plantId))
            .orderBy(desc(careLogs.date))
          return rows.map(mapToCareLog)
        }),

      findById: (id: string, plantId: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select()
            .from(careLogs)
            .where(and(eq(careLogs.id, id), eq(careLogs.plantId, plantId)))
          return row ? mapToCareLog(row) : null
        }),

      create: (data: CreateCareLogData) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .insert(careLogs)
            .values({
              type: data.type,
              notes: data.notes ?? null,
              date: data.date ?? new Date(),
              photoUrl: data.photoUrl ?? null,
              plantId: data.plantId,
            })
            .returning()
          return row ? mapToCareLog(row) : null
        }),

      update: (id: string, data: UpdateCareLogData) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(careLogs)
            .set({
              notes: data.notes ?? null,
              date: data.date,
              photoUrl: data.photoUrl ?? null,
              updatedAt: new Date(),
            })
            .where(eq(careLogs.id, id))
            .returning()
          return row ? mapToCareLog(row) : null
        }),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .delete(careLogs)
            .where(eq(careLogs.id, id))
            .returning()
          return row ? mapToCareLog(row) : null
        }),
    }
  })
)
