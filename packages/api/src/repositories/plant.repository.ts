import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import {
  careDelegations,
  delegationPlants,
  plantPhotos,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import {
  earliestOverdueDate,
  endOfDay,
  nowAsDate,
  type OverduePlant,
  type PaginatedResponse,
  paginate,
} from '@lily/shared'
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
  Order,
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
  includeCaretaking?: boolean
}

export type RoomRef = {
  id: string
  name: string
  icon: string
  luminosity: number | null
  isOutdoor: boolean
} | null

export type PlantWithRoom = typeof plants.$inferSelect & {
  room: RoomRef
  ownership: 'owned' | 'caretaking'
  ownerName: string | null
}

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
    cutoffDate: Date
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
  readonly findOverduePlantsByUser: () => Effect.Effect<
    Record<string, Array<OverduePlant>>,
    SqlError
  >
}

// Tag for dependency injection
export class PlantRepository extends Context.Tag('PlantRepository')<
  PlantRepository,
  IPlantRepository
>() {}

// Shared room selection shape for joins
const roomSelect = {
  id: rooms.id,
  name: rooms.name,
  icon: rooms.icon,
  luminosity: rooms.luminosity,
  isOutdoor: rooms.isOutdoor,
}

// Build where-clause conditions from filter and room params
function buildPlantFilters(params: FindPlantsParams): ReturnType<typeof and>[] {
  const filterCondition = pipe(
    Match.value(params.filter),
    Match.when('needsAttention', () =>
      Option.some(eq(plants.health, 'NEEDS_ATTENTION'))
    ),
    Match.when('overdue', () => {
      const endOfTodayDate = DateTime.toDateUtc(
        endOfDay(DateTime.unsafeNow(), params.timezone)
      )
      return Option.some(
        and(
          isNotNull(plants.nextWateringAt),
          lte(plants.nextWateringAt, endOfTodayDate)
        )
      )
    }),
    Match.orElse(() => Option.none())
  )

  const roomCondition = pipe(
    Option.fromNullable(params.roomId),
    Option.map((roomId) => eq(plants.roomId, roomId))
  )

  return pipe(
    [filterCondition, roomCondition],
    Array.filterMap((opt) => opt)
  )
}

// Build the drizzle orderBy clause from sort param
function buildPlantOrderBy(sort: FindPlantsParams['sort']) {
  return sort === 'name' ? asc(plants.name) : desc(plants.dateAdded)
}

// Map a DB row to an owned PlantWithRoom
function toOwnedPlant(row: {
  plant: typeof plants.$inferSelect
  room: RoomRef
}): PlantWithRoom {
  return {
    ...row.plant,
    room: row.room,
    ownership: 'owned' as const,
    ownerName: null,
  }
}

// Map a DB row to a caretaking PlantWithRoom
function toCaretakingPlant(row: {
  plant: typeof plants.$inferSelect
  room: RoomRef
  ownerName: string | null
}): PlantWithRoom {
  return {
    ...row.plant,
    room: row.room,
    ownership: 'caretaking' as const,
    ownerName: row.ownerName,
  }
}

// Live implementation using PgDrizzle
export const PlantRepositoryLive = Layer.effect(
  PlantRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findAll: (params: FindPlantsParams) =>
        Effect.gen(function* () {
          const { page, limit, offset } = getPaginationParams(params)
          const extraConditions = buildPlantFilters(params)
          const orderBy = buildPlantOrderBy(params.sort)

          // Owned plants query
          const ownedConditions = and(
            eq(plants.userId, params.userId),
            ...extraConditions
          )

          const ownedCountResult = yield* db
            .select({ value: count() })
            .from(plants)
            .where(ownedConditions)
          const ownedTotal = extractCount(ownedCountResult)

          const ownedRows = yield* db
            .select({ plant: plants, room: roomSelect })
            .from(plants)
            .leftJoin(rooms, eq(plants.roomId, rooms.id))
            .where(ownedConditions)
            .orderBy(orderBy)

          const ownedItems = Array.map(ownedRows, toOwnedPlant)

          if (!params.includeCaretaking) {
            const paginated = pipe(
              ownedItems,
              Array.drop(offset),
              Array.take(limit)
            )
            return paginate(paginated, ownedTotal, page, limit)
          }

          // Caretaking plants query
          const caretakingConditions = and(
            eq(careDelegations.caretakerId, params.userId),
            eq(careDelegations.status, 'active'),
            ...extraConditions
          )

          const caretakingCountResult = yield* db
            .select({ value: count() })
            .from(careDelegations)
            .innerJoin(
              delegationPlants,
              eq(careDelegations.id, delegationPlants.delegationId)
            )
            .innerJoin(plants, eq(delegationPlants.plantId, plants.id))
            .where(caretakingConditions)
          const caretakingTotal = extractCount(caretakingCountResult)

          const caretakingRows = yield* db
            .select({
              plant: plants,
              room: roomSelect,
              ownerName: users.name,
            })
            .from(careDelegations)
            .innerJoin(
              delegationPlants,
              eq(careDelegations.id, delegationPlants.delegationId)
            )
            .innerJoin(plants, eq(delegationPlants.plantId, plants.id))
            .leftJoin(rooms, eq(plants.roomId, rooms.id))
            .innerJoin(users, eq(careDelegations.ownerId, users.id))
            .where(caretakingConditions)
            .orderBy(orderBy)

          const caretakingItems = Array.map(caretakingRows, toCaretakingPlant)

          // Merge owned + caretaking, apply sort, paginate
          const allItems = Array.appendAll(ownedItems, caretakingItems)
          const sortOrder = pipe(
            Match.value(params.sort),
            Match.when('name', () =>
              Order.mapInput(Order.string, (p: PlantWithRoom) => p.name)
            ),
            Match.orElse(() =>
              Order.mapInput(Order.reverse(Order.number), (p: PlantWithRoom) =>
                p.dateAdded.getTime()
              )
            )
          )
          const sorted = Array.sort(allItems, sortOrder)

          const total = ownedTotal + caretakingTotal
          const paginated = pipe(sorted, Array.drop(offset), Array.take(limit))

          return paginate(paginated, total, page, limit)
        }).pipe(Effect.withSpan('PlantRepository.findAll')),

      findByIds: (ids: readonly string[]) =>
        Effect.gen(function* () {
          if (Array.isEmptyReadonlyArray(ids)) return []
          const items = yield* db
            .select()
            .from(plants)
            .where(inArray(plants.id, ids as string[]))
          return items
        }).pipe(Effect.withSpan('PlantRepository.findByIds')),

      findById: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select({ plant: plants, room: roomSelect })
            .from(plants)
            .leftJoin(rooms, eq(plants.roomId, rooms.id))
            .where(eq(plants.id, id))

          return pipe(
            Option.fromNullable(row),
            Option.map(toOwnedPlant),
            Option.getOrNull
          )
        }).pipe(Effect.withSpan('PlantRepository.findById')),

      findPlantsWithPendingCare: (userId: string, cutoffDate: Date) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ plant: plants, room: roomSelect })
            .from(plants)
            .leftJoin(rooms, eq(plants.roomId, rooms.id))
            .where(
              and(
                eq(plants.userId, userId),
                or(
                  lte(plants.nextWateringAt, cutoffDate),
                  lte(plants.nextFertilizationAt, cutoffDate)
                )
              )
            )
          return Array.map(rows, toOwnedPlant)
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
          const now = nowAsDate()
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
          return Array.length(result)
        }).pipe(
          Effect.withSpan('PlantRepository.markOverduePlantsAsNeedsAttention')
        ),

      markHealthyPlantsInOrder: () =>
        Effect.gen(function* () {
          const now = nowAsDate()
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
          return Array.length(result)
        }).pipe(Effect.withSpan('PlantRepository.markHealthyPlantsInOrder')),

      findOverduePlantsByUser: () =>
        Effect.gen(function* () {
          const now = nowAsDate()
          const rows = yield* db
            .select({
              id: plants.id,
              name: plants.name,
              userId: plants.userId,
              nextWateringAt: plants.nextWateringAt,
              nextFertilizationAt: plants.nextFertilizationAt,
            })
            .from(plants)
            .where(
              or(
                and(
                  isNotNull(plants.nextWateringAt),
                  lte(plants.nextWateringAt, now)
                ),
                and(
                  isNotNull(plants.nextFertilizationAt),
                  lte(plants.nextFertilizationAt, now)
                )
              )
            )
            .orderBy(asc(plants.userId))

          const mapped = Array.map(rows, (p) => ({
            id: p.id,
            name: p.name,
            userId: p.userId,
            overdueAt: earliestOverdueDate(
              [p.nextWateringAt, p.nextFertilizationAt],
              now
            ),
          }))

          return Array.groupBy(mapped, (p) => p.userId)
        }).pipe(Effect.withSpan('PlantRepository.findOverduePlantsByUser')),
    }
  })
)
