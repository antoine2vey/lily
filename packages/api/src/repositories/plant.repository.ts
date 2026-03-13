import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import {
  careDelegations,
  delegationPlants,
  plantCareSchedules,
  plantPhotos,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import {
  type CareType,
  endOfDay,
  nowAsDate,
  type PaginatedResponse,
  paginate,
} from '@lily/shared'
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  notInArray,
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

export type PlantCareScheduleRef = {
  careType: CareType
  frequencyDays: number
  lastCareAt: Date | null
  nextCareAt: Date | null
}

export type PlantWithRoom = typeof plants.$inferSelect & {
  room: RoomRef
  ownership: 'owned' | 'caretaking'
  ownerName: string | null
  schedules: PlantCareScheduleRef[]
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
  health: 'THRIVING' | 'HEALTHY' | 'NEEDS_ATTENTION' | 'SICK' | 'RECOVERING'
  userId: string
  roomId?: string | null
}

export interface UpdatePlantData {
  name?: string
  description?: string | null
  category?: string | null
  imageUrl?: string | null
  humidityRating?: number
  lightingRating?: number
  petToxicityRating?: number
  wateringRating?: number
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

// Shared room selection shape for joins
const roomSelect = {
  id: rooms.id,
  name: rooms.name,
  icon: rooms.icon,
  luminosity: rooms.luminosity,
  isOutdoor: rooms.isOutdoor,
}

// Build where-clause conditions from filter and room params
function buildPlantFilters(
  params: FindPlantsParams,
  // biome-ignore lint/suspicious/noExplicitAny: db type is inferred from PgDrizzle
  db: any
): ReturnType<typeof and>[] {
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
        inArray(
          plants.id,
          db
            .select({ plantId: plantCareSchedules.plantId })
            .from(plantCareSchedules)
            .where(
              and(
                isNotNull(plantCareSchedules.nextCareAt),
                lte(plantCareSchedules.nextCareAt, endOfTodayDate)
              )
            )
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
function toOwnedPlant(
  row: {
    plant: typeof plants.$inferSelect
    room: RoomRef
  },
  schedules: PlantCareScheduleRef[] = []
): PlantWithRoom {
  return {
    ...row.plant,
    room: row.room,
    ownership: 'owned' as const,
    ownerName: null,
    schedules,
  }
}

// Map a DB row to a caretaking PlantWithRoom
function toCaretakingPlant(
  row: {
    plant: typeof plants.$inferSelect
    room: RoomRef
    ownerName: string | null
  },
  schedules: PlantCareScheduleRef[] = []
): PlantWithRoom {
  return {
    ...row.plant,
    room: row.room,
    ownership: 'caretaking' as const,
    ownerName: row.ownerName,
    schedules,
  }
}

// Live implementation using PgDrizzle
export const PlantRepositoryLive = Layer.effect(
  PlantRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const fetchSchedulesForPlants = (plantIds: readonly string[]) =>
      Effect.gen(function* () {
        if (Array.isEmptyReadonlyArray(plantIds)) {
          return new Map<string, PlantCareScheduleRef[]>()
        }
        const rows = yield* db
          .select()
          .from(plantCareSchedules)
          .where(inArray(plantCareSchedules.plantId, plantIds as string[]))

        const grouped = new Map<string, PlantCareScheduleRef[]>()
        Array.forEach(rows, (r) => {
          const existing = pipe(
            Option.fromNullable(grouped.get(r.plantId)),
            Option.getOrElse(() => [] as PlantCareScheduleRef[])
          )
          existing.push({
            careType: r.careType,
            frequencyDays: r.frequencyDays,
            lastCareAt: r.lastCareAt,
            nextCareAt: r.nextCareAt,
          })
          grouped.set(r.plantId, existing)
        })
        return grouped
      })

    return {
      findAll: (params: FindPlantsParams) =>
        Effect.gen(function* () {
          const { page, limit, offset } = getPaginationParams(params)
          const extraConditions = buildPlantFilters(params, db)
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

          const ownedPlantIds = Array.map(ownedRows, (r) => r.plant.id)
          const ownedScheduleMap = yield* fetchSchedulesForPlants(ownedPlantIds)
          const ownedItems = Array.map(ownedRows, (row) =>
            toOwnedPlant(
              row,
              pipe(
                Option.fromNullable(ownedScheduleMap.get(row.plant.id)),
                Option.getOrElse(() => [] as PlantCareScheduleRef[])
              )
            )
          )

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

          const caretakingPlantIds = Array.map(
            caretakingRows,
            (r) => r.plant.id
          )
          const caretakingScheduleMap =
            yield* fetchSchedulesForPlants(caretakingPlantIds)
          const caretakingItems = Array.map(caretakingRows, (row) =>
            toCaretakingPlant(
              row,
              pipe(
                Option.fromNullable(caretakingScheduleMap.get(row.plant.id)),
                Option.getOrElse(() => [] as PlantCareScheduleRef[])
              )
            )
          )

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

          if (!row) return null

          const scheduleRows = yield* db
            .select()
            .from(plantCareSchedules)
            .where(eq(plantCareSchedules.plantId, id))
          const schedules: PlantCareScheduleRef[] = Array.map(
            scheduleRows,
            (r) => ({
              careType: r.careType,
              frequencyDays: r.frequencyDays,
              lastCareAt: r.lastCareAt,
              nextCareAt: r.nextCareAt,
            })
          )

          return toOwnedPlant(row, schedules)
        }).pipe(Effect.withSpan('PlantRepository.findById')),

      create: (data: CreatePlantData) =>
        Effect.gen(function* () {
          const [plant] = yield* db.insert(plants).values(data).returning()
          return pipe(Option.fromNullable(plant), Option.getOrNull)
        }).pipe(Effect.withSpan('PlantRepository.create')),

      update: (id: string, data: UpdatePlantData) =>
        Effect.gen(function* () {
          const [plant] = yield* db
            .update(plants)
            .set(data)
            .where(eq(plants.id, id))
            .returning()
          return pipe(Option.fromNullable(plant), Option.getOrNull)
        }).pipe(Effect.withSpan('PlantRepository.update')),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [plant] = yield* db
            .delete(plants)
            .where(eq(plants.id, id))
            .returning()
          return pipe(Option.fromNullable(plant), Option.getOrNull)
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
          return pipe(Option.fromNullable(photo), Option.getOrNull)
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
          return pipe(Option.fromNullable(photo), Option.getOrNull)
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
          const result = yield* db
            .update(plants)
            .set({ health: 'NEEDS_ATTENTION' })
            .where(
              and(
                or(eq(plants.health, 'HEALTHY'), eq(plants.health, 'THRIVING')),
                inArray(
                  plants.id,
                  db
                    .select({ plantId: plantCareSchedules.plantId })
                    .from(plantCareSchedules)
                    .where(
                      and(
                        isNotNull(plantCareSchedules.nextCareAt),
                        lte(plantCareSchedules.nextCareAt, now)
                      )
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
          // Plants that are NEEDS_ATTENTION but have no overdue schedules
          const result = yield* db
            .update(plants)
            .set({ health: 'HEALTHY' })
            .where(
              and(
                eq(plants.health, 'NEEDS_ATTENTION'),
                notInArray(
                  plants.id,
                  db
                    .select({ plantId: plantCareSchedules.plantId })
                    .from(plantCareSchedules)
                    .where(
                      and(
                        isNotNull(plantCareSchedules.nextCareAt),
                        lte(plantCareSchedules.nextCareAt, now)
                      )
                    )
                )
              )
            )
            .returning()
          return Array.length(result)
        }).pipe(Effect.withSpan('PlantRepository.markHealthyPlantsInOrder')),
    }
  })
)
