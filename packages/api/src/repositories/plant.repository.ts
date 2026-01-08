import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plantPhotos, plants } from '@lily/db'
import { type PaginatedResponse, paginate } from '@lily/shared'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

// Types for repository methods
export interface FindPlantsParams {
  page?: number
  limit?: number
  filter?: 'needsAttention' | 'all'
  sort?: 'added' | 'name'
  userId?: string
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
  readonly findById: (
    id: string
  ) => Effect.Effect<typeof plants.$inferSelect | null, SqlError>
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
  ) => Effect.Effect<void, SqlError>
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
          const page = params.page ?? 1
          const limit = params.limit ?? 20
          const offset = (page - 1) * limit

          // Build filter conditions
          const filterConditions =
            params.filter === 'needsAttention'
              ? eq(plants.health, 'NEEDS_ATTENTION')
              : undefined

          const countResult = yield* db
            .select({ value: count() })
            .from(plants)
            .where(filterConditions)
          const total = countResult[0]?.value ?? 0

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

      findById: (id: string) =>
        Effect.gen(function* () {
          const [plant] = yield* db
            .select()
            .from(plants)
            .where(eq(plants.id, id))
          return plant ?? null
        }),

      create: (data: CreatePlantData) =>
        Effect.gen(function* () {
          const [plant] = yield* db.insert(plants).values(data).returning()
          return plant ?? null
        }),

      update: (id: string, data: UpdatePlantData) =>
        Effect.gen(function* () {
          const [plant] = yield* db
            .update(plants)
            .set(data)
            .where(eq(plants.id, id))
            .returning()
          return plant ?? null
        }),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [plant] = yield* db
            .delete(plants)
            .where(eq(plants.id, id))
            .returning()
          return plant ?? null
        }),

      findPhotos: (params: FindPhotosParams) =>
        Effect.gen(function* () {
          const page = params.page ?? 1
          const limit = params.limit ?? 20
          const offset = (page - 1) * limit

          const countResult = yield* db
            .select({ value: count() })
            .from(plantPhotos)
            .where(eq(plantPhotos.plantId, params.plantId))
          const total = countResult[0]?.value ?? 0

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
          return photo ?? null
        }),

      addPhotos: (
        photos: Array<{ plantId: string; url: string; takenAt: Date }>
      ) =>
        Effect.gen(function* () {
          yield* db.insert(plantPhotos).values(photos)
        }),

      deletePhoto: (photoId: string) =>
        Effect.gen(function* () {
          const [photo] = yield* db
            .delete(plantPhotos)
            .where(eq(plantPhotos.id, photoId))
            .returning()
          return photo ?? null
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
