import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plantPhotos, plants } from '@lily/db'
import { type PaginatedResponse, paginate } from '@lily/shared'
import { and, asc, count, desc, eq, inArray, lte, or } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

// Types for repository methods
export interface FindPlantsParams {
  page?: number
  limit?: number
  filter?: 'needsAttention' | 'all'
  sort?: 'added' | 'name'
  userId: string
}

export type FindPlantsResult = PaginatedResponse<typeof plants.$inferSelect>

export interface CreatePlantData {
  name: string
  description: string | null
  category: string | null
  humidityRating: number
  lightingRating: number
  petToxicityRating: number
  wateringRating: number
  wateringFrequencyDays: number
  fertilizationFrequencyDays?: number | null
  health: 'THRIVING' | 'HEALTHY' | 'NEEDS_ATTENTION' | 'SICK' | 'RECOVERING'
  userId: string
}

export interface UpdatePlantData {
  name?: string
  description?: string | null
  category?: string | null
  imageUrl?: string | null
  wateringFrequencyDays?: number
  humidityRating?: number
  lightingRating?: number
  petToxicityRating?: number
  wateringRating?: number
  lastWateredAt?: Date
  nextWateringAt?: Date
  lastFertilizedAt?: Date
  nextFertilizationAt?: Date
  health?: 'THRIVING' | 'HEALTHY' | 'NEEDS_ATTENTION' | 'SICK' | 'RECOVERING'
}

export interface FindPhotosParams {
  plantId: string
  page?: number
  limit?: number
}

export type FindPhotosResult = PaginatedResponse<
  typeof plantPhotos.$inferSelect
>

// Repository service interface
export interface IPlantRepository {
  readonly findAll: (
    params: FindPlantsParams
  ) => Effect.Effect<FindPlantsResult, SqlError>
  readonly findByIds: (
    ids: readonly string[]
  ) => Effect.Effect<Array<typeof plants.$inferSelect>, SqlError>
  readonly findById: (
    id: string
  ) => Effect.Effect<typeof plants.$inferSelect | null, SqlError>
  readonly findPlantsWithPendingCare: (
    userId: string,
    endOfWeek: Date
  ) => Effect.Effect<Array<typeof plants.$inferSelect>, SqlError>
  readonly create: (
    data: CreatePlantData
  ) => Effect.Effect<typeof plants.$inferSelect | null, SqlError>
  readonly update: (
    id: string,
    data: UpdatePlantData
  ) => Effect.Effect<typeof plants.$inferSelect | null, SqlError>
  readonly delete: (
    id: string
  ) => Effect.Effect<typeof plants.$inferSelect | null, SqlError>
  readonly findPhotos: (
    params: FindPhotosParams
  ) => Effect.Effect<FindPhotosResult, SqlError>
  readonly addPhoto: (
    plantId: string,
    url: string
  ) => Effect.Effect<typeof plantPhotos.$inferSelect | null, SqlError>
  readonly addPhotos: (
    photos: Array<{ plantId: string; url: string; takenAt: Date }>
  ) => Effect.Effect<Array<typeof plantPhotos.$inferSelect>, SqlError>
  readonly deletePhoto: (
    photoId: string
  ) => Effect.Effect<typeof plantPhotos.$inferSelect | null, SqlError>
  readonly deletePhotoByPlantId: (
    plantId: string,
    photoId: string
  ) => Effect.Effect<void, SqlError>
}

// Tag for dependency injection
export class PlantRepository extends Context.Tag('PlantRepository')<
  PlantRepository,
  IPlantRepository
>() {}

// Live implementation using PgDrizzle
export const PlantRepositoryLive = Layer.effect(
  PlantRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findAll: (params: FindPlantsParams) =>
        Effect.gen(function* () {
          const page = pipe(
            Option.fromNullable(params.page),
            Option.getOrElse(() => 1)
          )
          const limit = pipe(
            Option.fromNullable(params.limit),
            Option.getOrElse(() => 20)
          )
          const offset = (page - 1) * limit

          // Build filter conditions
          const userCondition = eq(plants.userId, params.userId)
          const healthCondition =
            params.filter === 'needsAttention'
              ? eq(plants.health, 'NEEDS_ATTENTION')
              : undefined

          const filterConditions = healthCondition
            ? and(userCondition, healthCondition)
            : userCondition

          const countResult = yield* db
            .select({ value: count() })
            .from(plants)
            .where(filterConditions)
          const total = pipe(
            Array.head(countResult),
            Option.flatMap((r) => Option.fromNullable(r.value)),
            Option.getOrElse(() => 0)
          )

          const items = yield* db
            .select()
            .from(plants)
            .where(filterConditions)
            .offset(offset)
            .limit(limit)
            .orderBy(
              params.sort === 'name' ? asc(plants.name) : desc(plants.dateAdded)
            )

          return paginate(items, total, page, limit)
        }),

      findByIds: (ids: readonly string[]) =>
        Effect.gen(function* () {
          if (ids.length === 0) return []
          const items = yield* db
            .select()
            .from(plants)
            .where(inArray(plants.id, ids as string[]))
          return items
        }),

      findById: (id: string) =>
        Effect.gen(function* () {
          const [plant] = yield* db
            .select()
            .from(plants)
            .where(eq(plants.id, id))
          return Option.getOrNull(Option.fromNullable(plant))
        }),

      findPlantsWithPendingCare: (userId: string, endOfWeek: Date) =>
        Effect.gen(function* () {
          const items = yield* db
            .select()
            .from(plants)
            .where(
              and(
                eq(plants.userId, userId),
                or(
                  lte(plants.nextWateringAt, endOfWeek),
                  lte(plants.nextFertilizationAt, endOfWeek)
                )
              )
            )
          return items
        }),

      create: (data: CreatePlantData) =>
        Effect.gen(function* () {
          const [plant] = yield* db.insert(plants).values(data).returning()
          return Option.getOrNull(Option.fromNullable(plant))
        }),

      update: (id: string, data: UpdatePlantData) =>
        Effect.gen(function* () {
          const [plant] = yield* db
            .update(plants)
            .set(data)
            .where(eq(plants.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(plant))
        }),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [plant] = yield* db
            .delete(plants)
            .where(eq(plants.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(plant))
        }),

      findPhotos: (params: FindPhotosParams) =>
        Effect.gen(function* () {
          const page = pipe(
            Option.fromNullable(params.page),
            Option.getOrElse(() => 1)
          )
          const limit = pipe(
            Option.fromNullable(params.limit),
            Option.getOrElse(() => 20)
          )
          const offset = (page - 1) * limit

          const countResult = yield* db
            .select({ value: count() })
            .from(plantPhotos)
            .where(eq(plantPhotos.plantId, params.plantId))
          const total = pipe(
            Array.head(countResult),
            Option.flatMap((r) => Option.fromNullable(r.value)),
            Option.getOrElse(() => 0)
          )

          const items = yield* db
            .select()
            .from(plantPhotos)
            .where(eq(plantPhotos.plantId, params.plantId))
            .offset(offset)
            .limit(limit)
            .orderBy(desc(plantPhotos.takenAt))

          return paginate(items, total, page, limit)
        }),

      addPhoto: (plantId: string, url: string) =>
        Effect.gen(function* () {
          const [photo] = yield* db
            .insert(plantPhotos)
            .values({ plantId, url })
            .returning()
          return Option.getOrNull(Option.fromNullable(photo))
        }),

      addPhotos: (
        photos: Array<{ plantId: string; url: string; takenAt: Date }>
      ) =>
        Effect.gen(function* () {
          const result = yield* db
            .insert(plantPhotos)
            .values(photos)
            .returning()
          return result
        }),

      deletePhoto: (photoId: string) =>
        Effect.gen(function* () {
          const [photo] = yield* db
            .delete(plantPhotos)
            .where(eq(plantPhotos.id, photoId))
            .returning()
          return Option.getOrNull(Option.fromNullable(photo))
        }),

      deletePhotoByPlantId: (plantId: string, photoId: string) =>
        Effect.gen(function* () {
          yield* db
            .delete(plantPhotos)
            .where(
              and(eq(plantPhotos.id, photoId), eq(plantPhotos.plantId, plantId))
            )
        }),
    }
  })
)
