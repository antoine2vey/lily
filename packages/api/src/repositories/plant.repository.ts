import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import {
  type CanopyOwner,
  ownedBy,
  ownerColumns,
  type UserOwner,
  type WithOwner,
  withCanopyOwner,
  withOwner,
  withOwnerOrNull,
  withUserOwner,
} from '@lily/api/repositories/helpers/plant-owner'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  canopyMembers,
  careDelegations,
  delegationPlants,
  plantCareSchedules,
  plantPhotos,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import {
  type CanopyRef,
  type CareType,
  endOfDay,
  nowAsDate,
  type Orientation,
  type PaginatedResponse,
  type PlantCreator,
  type PlantDeathCause,
  type PlantFilter,
  type PlantHealthStatus,
  type PlantOwner,
  type PlantSort,
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
  isNull,
  lte,
  notInArray,
  or,
  sql,
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
import type { SqlError } from 'effect/sql/SqlError'

type Db = PgDrizzle.PgDrizzle['Service']

// Types for repository methods
export interface FindPlantsParams {
  page?: number
  limit?: number
  filter?: PlantFilter
  sort?: PlantSort
  roomId?: string
  userId: string
  timezone: string
  includeCaretaking?: boolean
  includeCanopy?: boolean
  /**
   * Admin only: return living and dead plants together. Without it, every
   * filter except `dead` restricts the result to living plants.
   */
  includeDead?: boolean
}

export type RoomRef = {
  id: string
  name: string
  icon: string
  luminosity: number | null
  orientation: Orientation | null
  isOutdoor: boolean
} | null

export type PlantCareScheduleRef = {
  careType: CareType
  frequencyDays: number
  lastCareAt: Date | null
  nextCareAt: Date | null
}

export type PlantRow = WithOwner<typeof plants.$inferSelect>

export type PlantScope =
  | { owner: UserOwner; ownership: 'owned'; ownerName: null }
  | { owner: UserOwner; ownership: 'caretaking'; ownerName: string | null }
  | {
      owner: CanopyOwner
      ownership: 'canopy'
      ownerName: null
      canopy: CanopyRef
      createdBy: PlantCreator | null
    }

export type PlantWithRoom = RawPlant &
  PlantScope & {
    room: RoomRef
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
  health: PlantHealthStatus
  potWidthCm?: number | null
  potHeightCm?: number | null
  owner: PlantOwner
  createdByUserId: string
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
  health?: PlantHealthStatus
  potWidthCm?: number | null
  potHeightCm?: number | null
  roomId?: string | null
}

export interface MarkPlantDeadData {
  diedAt: Date
  cause: PlantDeathCause
  note: string | null
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
  ) => Effect.Effect<Array<PlantRow>, SqlError>
  readonly findById: (
    id: string
  ) => Effect.Effect<PlantWithRoom | null, SqlError>
  readonly create: (
    data: CreatePlantData
  ) => Effect.Effect<PlantRow | null, SqlError>
  readonly update: (
    id: string,
    owner: PlantOwner,
    data: UpdatePlantData
  ) => Effect.Effect<PlantRow | null, SqlError>
  readonly delete: (
    id: string,
    owner: PlantOwner
  ) => Effect.Effect<PlantRow | null, SqlError>
  readonly markDead: (
    id: string,
    owner: PlantOwner,
    data: MarkPlantDeadData
  ) => Effect.Effect<PlantRow | null, SqlError>
  readonly revive: (
    id: string,
    owner: PlantOwner
  ) => Effect.Effect<PlantRow | null, SqlError>
  readonly moveTo: (
    id: string,
    from: PlantOwner,
    to: PlantOwner,
    roomId: string | null
  ) => Effect.Effect<PlantRow | null, SqlError>
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
export class PlantRepository extends Context.Service<
  PlantRepository,
  IPlantRepository
>()('PlantRepository') {}

// Shared room selection shape for joins
const roomSelect = {
  id: rooms.id,
  name: rooms.name,
  icon: rooms.icon,
  luminosity: rooms.luminosity,
  orientation: rooms.orientation,
  isOutdoor: rooms.isOutdoor,
}

// Build where-clause conditions from filter and room params
function buildPlantFilters(
  params: FindPlantsParams,
  db: Db
): ReturnType<typeof and>[] {
  const filterCondition = pipe(
    Match.value(params.filter),
    Match.when('needsAttention', () =>
      Option.some(eq(plants.health, 'NEEDS_ATTENTION'))
    ),
    Match.when('overdue', () => {
      const endOfTodayDate = DateTime.toDateUtc(
        endOfDay(DateTime.nowUnsafe(), params.timezone)
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
    Match.when('dead', () => Option.some(isNotNull(plants.diedAt))),
    Match.orElse(() => Option.none())
  )

  // `dead` lists the cemetery; everything else means living plants unless an
  // admin caller explicitly asks for both.
  const livingCondition =
    params.filter === 'dead' || params.includeDead
      ? Option.none()
      : Option.some(isLivingPlant())

  const roomCondition = pipe(
    Option.fromNullishOr(params.roomId),
    Option.map((roomId) => eq(plants.roomId, roomId))
  )

  return pipe([filterCondition, livingCondition, roomCondition], Array.getSomes)
}

// Build the drizzle orderBy clause from sort param
function buildPlantOrderBy(sort: FindPlantsParams['sort']) {
  return sort === 'name'
    ? [asc(plants.name), asc(plants.id)]
    : [desc(plants.dateAdded), asc(plants.id)]
}

type RawPlant = typeof plants.$inferSelect

const canopySelect = { name: canopies.name }
const creatorSelect = { id: users.id, name: users.name }

// Map a DB row to an owned PlantWithRoom
function toOwnedPlant(
  row: {
    plant: RawPlant
    room: RoomRef
  },
  schedules: PlantCareScheduleRef[] = []
): PlantWithRoom {
  return {
    ...withUserOwner(row.plant),
    room: row.room,
    ownership: 'owned' as const,
    ownerName: null,
    schedules,
  }
}

// Map a DB row to a caretaking PlantWithRoom
function toCaretakingPlant(
  row: {
    plant: RawPlant
    room: RoomRef
    ownerName: string | null
  },
  schedules: PlantCareScheduleRef[] = []
): PlantWithRoom {
  return {
    ...withUserOwner(row.plant),
    room: row.room,
    ownership: 'caretaking' as const,
    ownerName: row.ownerName,
    schedules,
  }
}

function toCanopyPlant(
  row: {
    plant: RawPlant
    room: RoomRef
    canopy: { name: string }
    creator: PlantCreator | null
  },
  schedules: PlantCareScheduleRef[] = []
): PlantWithRoom {
  const plant = withCanopyOwner(row.plant)
  return {
    ...plant,
    room: row.room,
    ownership: 'canopy' as const,
    ownerName: null,
    canopy: { id: plant.owner.canopyId, name: row.canopy.name },
    createdBy: row.creator,
    schedules,
  }
}

const schedulesFor =
  (scheduleMap: Map<string, PlantCareScheduleRef[]>) => (plantId: string) =>
    pipe(
      Option.fromNullishOr(scheduleMap.get(plantId)),
      Option.getOrElse(() => [] as PlantCareScheduleRef[])
    )

// Live implementation using PgDrizzle
export const PlantRepositoryLive = Layer.effect(
  PlantRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const fetchSchedulesForPlants = Effect.fn(
      'PlantRepository.fetchSchedulesForPlants'
    )(function* (plantIds: readonly string[]) {
      if (Array.isReadonlyArrayEmpty(plantIds)) {
        return new Map<string, PlantCareScheduleRef[]>()
      }
      const rows = yield* db
        .select()
        .from(plantCareSchedules)
        .where(inArray(plantCareSchedules.plantId, [...plantIds]))

      const grouped = new Map<string, PlantCareScheduleRef[]>()
      Array.forEach(rows, (r) => {
        const existing = pipe(
          Option.fromNullishOr(grouped.get(r.plantId)),
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

    const findCaretakingPlants = Effect.fn(
      'PlantRepository.findCaretakingPlants'
    )(function* (
      params: FindPlantsParams,
      extraConditions: ReturnType<typeof and>[],
      orderBy: ReturnType<typeof buildPlantOrderBy>
    ) {
      const conditions = and(
        eq(careDelegations.caretakerId, params.userId),
        eq(careDelegations.status, 'active'),
        isNotNull(plants.userId),
        ...extraConditions
      )

      const countResult = yield* db
        .select({ value: count() })
        .from(careDelegations)
        .innerJoin(
          delegationPlants,
          eq(careDelegations.id, delegationPlants.delegationId)
        )
        .innerJoin(plants, eq(delegationPlants.plantId, plants.id))
        .where(conditions)

      const rows = yield* db
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
        .where(conditions)
        .orderBy(...orderBy)

      const schedules = schedulesFor(
        yield* fetchSchedulesForPlants(Array.map(rows, (r) => r.plant.id))
      )
      return {
        items: Array.map(rows, (row) =>
          toCaretakingPlant(row, schedules(row.plant.id))
        ),
        total: extractCount(countResult),
      }
    })

    const findCanopyPlants = Effect.fn('PlantRepository.findCanopyPlants')(
      function* (
        params: FindPlantsParams,
        extraConditions: ReturnType<typeof and>[],
        orderBy: ReturnType<typeof buildPlantOrderBy>
      ) {
        const conditions = and(
          eq(canopyMembers.userId, params.userId),
          ...extraConditions
        )

        const countResult = yield* db
          .select({ value: count() })
          .from(plants)
          .innerJoin(canopyMembers, eq(plants.canopyId, canopyMembers.canopyId))
          .where(conditions)

        const rows = yield* db
          .select({
            plant: plants,
            room: roomSelect,
            canopy: canopySelect,
            creator: creatorSelect,
          })
          .from(plants)
          .innerJoin(canopyMembers, eq(plants.canopyId, canopyMembers.canopyId))
          .innerJoin(canopies, eq(plants.canopyId, canopies.id))
          .leftJoin(rooms, eq(plants.roomId, rooms.id))
          .leftJoin(users, eq(plants.createdByUserId, users.id))
          .where(conditions)
          .orderBy(...orderBy)

        const schedules = schedulesFor(
          yield* fetchSchedulesForPlants(Array.map(rows, (r) => r.plant.id))
        )
        return {
          items: Array.map(rows, (row) =>
            toCanopyPlant(row, schedules(row.plant.id))
          ),
          total: extractCount(countResult),
        }
      }
    )

    return {
      findAll: Effect.fn('PlantRepository.findAll')(function* (
        params: FindPlantsParams
      ) {
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
          .orderBy(...orderBy)

        const ownedPlantIds = Array.map(ownedRows, (r) => r.plant.id)
        const ownedSchedules = schedulesFor(
          yield* fetchSchedulesForPlants(ownedPlantIds)
        )
        const ownedItems = Array.map(ownedRows, (row) =>
          toOwnedPlant(row, ownedSchedules(row.plant.id))
        )

        if (!params.includeCaretaking && !params.includeCanopy) {
          const paginated = pipe(
            ownedItems,
            Array.drop(offset),
            Array.take(limit)
          )
          return paginate(paginated, ownedTotal, page, limit)
        }

        const caretaking = params.includeCaretaking
          ? yield* findCaretakingPlants(params, extraConditions, orderBy)
          : { items: [], total: 0 }
        const canopy = params.includeCanopy
          ? yield* findCanopyPlants(params, extraConditions, orderBy)
          : { items: [], total: 0 }

        const allItems = pipe(
          ownedItems,
          Array.appendAll(caretaking.items),
          Array.appendAll(canopy.items)
        )
        const sortOrder = Order.combine(
          pipe(
            Match.value(params.sort),
            Match.when('name', () =>
              Order.mapInput(Order.String, (p: PlantWithRoom) => p.name)
            ),
            Match.orElse(() =>
              Order.mapInput(Order.flip(Order.Number), (p: PlantWithRoom) =>
                p.dateAdded.getTime()
              )
            )
          ),
          Order.mapInput(Order.String, (p: PlantWithRoom) => p.id)
        )
        const sorted = Array.sort(allItems, sortOrder)

        const total = ownedTotal + caretaking.total + canopy.total
        const paginated = pipe(sorted, Array.drop(offset), Array.take(limit))

        return paginate(paginated, total, page, limit)
      }),

      findByIds: Effect.fn('PlantRepository.findByIds')(function* (
        ids: readonly string[]
      ) {
        if (Array.isReadonlyArrayEmpty(ids)) return []
        const items = yield* db
          .select()
          .from(plants)
          .where(inArray(plants.id, [...ids]))
        return Array.map(items, withOwner)
      }),

      findById: Effect.fn('PlantRepository.findById')(function* (id: string) {
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

        if (row.plant.canopyId === null) return toOwnedPlant(row, schedules)

        const [scope] = yield* db
          .select({ canopy: canopySelect, creator: creatorSelect })
          .from(canopies)
          .leftJoin(
            users,
            row.plant.createdByUserId === null
              ? sql`false`
              : eq(users.id, row.plant.createdByUserId)
          )
          .where(eq(canopies.id, row.plant.canopyId))
        if (!scope) return null
        return toCanopyPlant({ ...row, ...scope }, schedules)
      }),

      create: Effect.fn('PlantRepository.create')(function* (
        data: CreatePlantData
      ) {
        const { owner, ...fields } = data
        const [plant] = yield* db
          .insert(plants)
          .values({ ...fields, ...ownerColumns(owner) })
          .returning()
        return withOwnerOrNull(plant)
      }),

      update: Effect.fn('PlantRepository.update')(function* (
        id: string,
        owner: PlantOwner,
        data: UpdatePlantData
      ) {
        const [plant] = yield* db
          .update(plants)
          .set({ ...data, updatedAt: nowAsDate() })
          .where(and(eq(plants.id, id), ownedBy(plants, owner)))
          .returning()
        return withOwnerOrNull(plant)
      }),

      delete: Effect.fn('PlantRepository.delete')(function* (
        id: string,
        owner: PlantOwner
      ) {
        const [plant] = yield* db
          .delete(plants)
          .where(and(eq(plants.id, id), ownedBy(plants, owner)))
          .returning()
        return withOwnerOrNull(plant)
      }),

      markDead: Effect.fn('PlantRepository.markDead')(function* (
        id: string,
        owner: PlantOwner,
        data: MarkPlantDeadData
      ) {
        const [plant] = yield* db
          .update(plants)
          .set({
            diedAt: data.diedAt,
            deathCause: data.cause,
            deathNote: data.note,
          })
          .where(
            and(
              eq(plants.id, id),
              ownedBy(plants, owner),
              isNull(plants.diedAt)
            )
          )
          .returning()
        return withOwnerOrNull(plant)
      }),

      revive: Effect.fn('PlantRepository.revive')(function* (
        id: string,
        owner: PlantOwner
      ) {
        const [plant] = yield* db
          .update(plants)
          .set({ diedAt: null, deathCause: null, deathNote: null })
          .where(
            and(
              eq(plants.id, id),
              ownedBy(plants, owner),
              isNotNull(plants.diedAt)
            )
          )
          .returning()
        return withOwnerOrNull(plant)
      }),

      moveTo: Effect.fn('PlantRepository.moveTo')(function* (
        id: string,
        from: PlantOwner,
        to: PlantOwner,
        roomId: string | null
      ) {
        const [plant] = yield* db
          .update(plants)
          .set({ ...ownerColumns(to), roomId, updatedAt: nowAsDate() })
          .where(and(eq(plants.id, id), ownedBy(plants, from)))
          .returning()
        return withOwnerOrNull(plant)
      }),

      findPhotos: Effect.fn('PlantRepository.findPhotos')(function* (
        params: FindPhotosParams
      ) {
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
      }),

      addPhoto: Effect.fn('PlantRepository.addPhoto')(function* (
        plantId: string,
        url: string
      ) {
        const [photo] = yield* db
          .insert(plantPhotos)
          .values({ plantId, url })
          .returning()
        return pipe(Option.fromNullishOr(photo), Option.getOrNull)
      }),

      addPhotos: Effect.fn('PlantRepository.addPhotos')(function* (
        photos: Array<{ plantId: string; url: string; takenAt: Date }>
      ) {
        const result = yield* db.insert(plantPhotos).values(photos).returning()
        return result
      }),

      deletePhoto: Effect.fn('PlantRepository.deletePhoto')(function* (
        photoId: string
      ) {
        const [photo] = yield* db
          .delete(plantPhotos)
          .where(eq(plantPhotos.id, photoId))
          .returning()
        return pipe(Option.fromNullishOr(photo), Option.getOrNull)
      }),

      deletePhotoByPlantId: Effect.fn('PlantRepository.deletePhotoByPlantId')(
        function* (plantId: string, photoId: string) {
          yield* db
            .delete(plantPhotos)
            .where(
              and(eq(plantPhotos.id, photoId), eq(plantPhotos.plantId, plantId))
            )
        }
      ),

      markOverduePlantsAsNeedsAttention: Effect.fn(
        'PlantRepository.markOverduePlantsAsNeedsAttention'
      )(function* () {
        const now = nowAsDate()
        const result = yield* db
          .update(plants)
          .set({ health: 'NEEDS_ATTENTION' })
          .where(
            and(
              isLivingPlant(),
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
      }),

      markHealthyPlantsInOrder: Effect.fn(
        'PlantRepository.markHealthyPlantsInOrder'
      )(function* () {
        const now = nowAsDate()
        // Plants that are NEEDS_ATTENTION but have no overdue schedules
        const result = yield* db
          .update(plants)
          .set({ health: 'HEALTHY' })
          .where(
            and(
              isLivingPlant(),
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
      }),
    }
  })
)
