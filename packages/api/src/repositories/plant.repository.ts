import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import { plantPhotos, plants, rooms } from '@lily/db'
import { endOfDay, type PaginatedResponse, paginate } from '@lily/shared'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
} from 'drizzle-orm'
import {
  Array,
  Context,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
} from 'effect'

// Types for repository methods
export interface FindPlantsParams {
  page?: number
  limit?: number
  filter?: 'needsAttention' | 'overdue' | 'all'
  sort?: 'added' | 'name'
  roomId?: string
  userId: string
  timezone: string
}

export type RoomRef = { id: string; name: string; icon: string } | null

export type PlantWithRoom = typeof plants.$inferSelect & { room: RoomRef }

export type FindPlantsResult = PaginatedResponse<PlantWithRoom>

export interface CreatePlantData {
  name: string
  description: string | null
  category: string | null
  imageUrl?: string | null
  humidityRating: number
  lightingRating: number
  petToxicityRating: number
  wateringRating: number
  wateringFrequencyDays: number
  fertilizationFrequencyDays?: number | null
  nextWateringAt?: Date
  nextFertilizationAt?: Date | null
  health: 'THRIVING' | 'HEALTHY' | 'NEEDS_ATTENTION' | 'SICK' | 'RECOVERING'
  userId: string
  roomId?: string | null
}

export interface UpdatePlantData {
  name?: string
  description?: string | null
  category?: string | null
  imageUrl?: string | null
  wateringFrequencyDays?: number
  fertilizationFrequencyDays?: number | null
  humidityRating?: number
  lightingRating?: number
  petToxicityRating?: number
  wateringRating?: number
  lastWateredAt?: Date
  nextWateringAt?: Date
  lastFertilizedAt?: Date
  nextFertilizationAt?: Date
  health?: 'THRIVING' | 'HEALTHY' | 'NEEDS_ATTENTION' | 'SICK' | 'RECOVERING'
  roomId?: string | null
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
  ) => Effect.Effect<PlantWithRoom | null, SqlError>
  readonly findPlantsWithPendingCare: (
    userId: string,
    endOfWeek: Date
  ) => Effect.Effect<Array<PlantWithRoom>, SqlError>
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
  readonly markOverduePlantsAsNeedsAttention: () => Effect.Effect<
    number,
    SqlError
  >
  readonly markHealthyPlantsInOrder: () => Effect.Effect<number, SqlError>
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
          const { page, limit, offset } = getPaginationParams(params)

          // Build filter conditions
          const conditions = [eq(plants.userId, params.userId)]

          const extraCondition = pipe(
            Match.value(params.filter),
            Match.when('needsAttention', () =>
              eq(plants.health, 'NEEDS_ATTENTION')
            ),
            Match.when('overdue', () => {
              const endOfTodayDate = DateTime.toDateUtc(
                endOfDay(DateTime.unsafeNow(), params.timezone)
              )
              return and(
                isNotNull(plants.nextWateringAt),
                lte(plants.nextWateringAt, endOfTodayDate)
              )
            }),
            Match.orElse(() => undefined)
          )

          if (extraCondition) {
            conditions.push(extraCondition)
          }

          if (params.roomId) {
            conditions.push(eq(plants.roomId, params.roomId))
          }

          const filterConditions = and(...conditions)

          const countResult = yield* db
            .select({ value: count() })
            .from(plants)
            .where(filterConditions)
          const total = extractCount(countResult)

          const rows = yield* db
            .select({
              plant: plants,
              room: {
                id: rooms.id,
                name: rooms.name,
                icon: rooms.icon,
              },
            })
            .from(plants)
            .leftJoin(rooms, eq(plants.roomId, rooms.id))
            .where(filterConditions)
            .offset(offset)
            .limit(limit)
            .orderBy(
              params.sort === 'name' ? asc(plants.name) : desc(plants.dateAdded)
            )

          const items = Array.map(rows, (row) => ({
            ...row.plant,
            room: row.room,
          }))

          return paginate(items, total, page, limit)
        }).pipe(Effect.withSpan('PlantRepository.findAll')),

      findByIds: (ids: readonly string[]) =>
        Effect.gen(function* () {
          if (ids.length === 0) return []
          const items = yield* db
            .select()
            .from(plants)
            .where(inArray(plants.id, ids as string[]))
          return items
        }).pipe(Effect.withSpan('PlantRepository.findByIds')),

      findById: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select({
              plant: plants,
              room: {
                id: rooms.id,
                name: rooms.name,
                icon: rooms.icon,
              },
            })
            .from(plants)
            .leftJoin(rooms, eq(plants.roomId, rooms.id))
            .where(eq(plants.id, id))

          return pipe(
            Option.fromNullable(row),
            Option.map((r) => ({ ...r.plant, room: r.room })),
            Option.getOrNull
          )
        }).pipe(Effect.withSpan('PlantRepository.findById')),

      findPlantsWithPendingCare: (userId: string, endOfWeek: Date) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({
              plant: plants,
              room: {
                id: rooms.id,
                name: rooms.name,
                icon: rooms.icon,
              },
            })
            .from(plants)
            .leftJoin(rooms, eq(plants.roomId, rooms.id))
            .where(
              and(
                eq(plants.userId, userId),
                or(
                  lte(plants.nextWateringAt, endOfWeek),
                  lte(plants.nextFertilizationAt, endOfWeek)
                )
              )
            )
          return Array.map(rows, (row) => ({
            ...row.plant,
            room: row.room,
          }))
        }).pipe(Effect.withSpan('PlantRepository.findPlantsWithPendingCare')),

      create: (data: CreatePlantData) =>
        Effect.gen(function* () {
          const [plant] = yield* db.insert(plants).values(data).returning()
          return Option.getOrNull(Option.fromNullable(plant))
        }).pipe(Effect.withSpan('PlantRepository.create')),

      update: (id: string, data: UpdatePlantData) =>
        Effect.gen(function* () {
          const [plant] = yield* db
            .update(plants)
            .set(data)
            .where(eq(plants.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(plant))
        }).pipe(Effect.withSpan('PlantRepository.update')),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [plant] = yield* db
            .delete(plants)
            .where(eq(plants.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(plant))
        }).pipe(Effect.withSpan('PlantRepository.delete')),

      findPhotos: (params: FindPhotosParams) =>
        Effect.gen(function* () {
          const { page, limit, offset } = getPaginationParams(params)

          const countResult = yield* db
            .select({ value: count() })
            .from(plantPhotos)
            .where(eq(plantPhotos.plantId, params.plantId))
          const total = extractCount(countResult)

          const items = yield* db
            .select()
            .from(plantPhotos)
            .where(eq(plantPhotos.plantId, params.plantId))
            .offset(offset)
            .limit(limit)
            .orderBy(desc(plantPhotos.takenAt))

          return paginate(items, total, page, limit)
        }).pipe(Effect.withSpan('PlantRepository.findPhotos')),

      addPhoto: (plantId: string, url: string) =>
        Effect.gen(function* () {
          const [photo] = yield* db
            .insert(plantPhotos)
            .values({ plantId, url })
            .returning()
          return Option.getOrNull(Option.fromNullable(photo))
        }).pipe(Effect.withSpan('PlantRepository.addPhoto')),

      addPhotos: (
        photos: Array<{ plantId: string; url: string; takenAt: Date }>
      ) =>
        Effect.gen(function* () {
          const result = yield* db
            .insert(plantPhotos)
            .values(photos)
            .returning()
          return result
        }).pipe(Effect.withSpan('PlantRepository.addPhotos')),

      deletePhoto: (photoId: string) =>
        Effect.gen(function* () {
          const [photo] = yield* db
            .delete(plantPhotos)
            .where(eq(plantPhotos.id, photoId))
            .returning()
          return Option.getOrNull(Option.fromNullable(photo))
        }).pipe(Effect.withSpan('PlantRepository.deletePhoto')),

      deletePhotoByPlantId: (plantId: string, photoId: string) =>
        Effect.gen(function* () {
          yield* db
            .delete(plantPhotos)
            .where(
              and(eq(plantPhotos.id, photoId), eq(plantPhotos.plantId, plantId))
            )
        }).pipe(Effect.withSpan('PlantRepository.deletePhotoByPlantId')),

      markOverduePlantsAsNeedsAttention: () =>
        Effect.gen(function* () {
          const now = new Date()
          // Find plants that are overdue (watering OR fertilization is past due)
          // and currently HEALTHY or THRIVING
          const result = yield* db
            .update(plants)
            .set({ health: 'NEEDS_ATTENTION' })
            .where(
              and(
                or(eq(plants.health, 'HEALTHY'), eq(plants.health, 'THRIVING')),
                or(
                  // Watering is overdue
                  and(
                    isNotNull(plants.nextWateringAt),
                    lte(plants.nextWateringAt, now)
                  ),
                  // Fertilization is overdue
                  and(
                    isNotNull(plants.nextFertilizationAt),
                    lte(plants.nextFertilizationAt, now)
                  )
                )
              )
            )
            .returning()
          return result.length
        }).pipe(
          Effect.withSpan('PlantRepository.markOverduePlantsAsNeedsAttention')
        ),

      markHealthyPlantsInOrder: () =>
        Effect.gen(function* () {
          const now = new Date()
          // Find plants that are NEEDS_ATTENTION but ALL their schedules are in order
          // Both watering AND fertilization must be OK (null or in the future)
          const result = yield* db
            .update(plants)
            .set({ health: 'HEALTHY' })
            .where(
              and(
                eq(plants.health, 'NEEDS_ATTENTION'),
                // Watering is OK (null or in the future)
                or(
                  isNull(plants.nextWateringAt),
                  gt(plants.nextWateringAt, now)
                ),
                // Fertilization is OK (null or in the future)
                or(
                  isNull(plants.nextFertilizationAt),
                  gt(plants.nextFertilizationAt, now)
                )
              )
            )
            .returning()
          return result.length
        }).pipe(Effect.withSpan('PlantRepository.markHealthyPlantsInOrder')),
    }
  })
)
