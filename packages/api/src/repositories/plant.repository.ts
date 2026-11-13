import {
  DueWindow,
  dueOnOrBefore,
  duePrune,
  hasOverdueCare,
  type SeenSchedule,
  type StoredSchedule,
  seePlantCare,
} from '@lily/api/contexts/care'
import { careTimezoneSql } from '@lily/api/repositories/helpers/care-timezone'
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
import { tending } from '@lily/api/repositories/helpers/tending'
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
  type CareDay,
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
  lt,
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

export type PlantCareScheduleRef = SeenSchedule

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
    careTimezone: string
    today: CareDay
  }

export type FindPlantsResult = PaginatedResponse<PlantWithRoom>

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
  readonly findLivingByCanopy: (
    canopyId: string
  ) => Effect.Effect<Array<PlantWithRoom>, SqlError>
  readonly findByIds: (
    ids: readonly string[]
  ) => Effect.Effect<Array<PlantRow>, SqlError>
  readonly findByIdsForKeyShare: (
    ids: readonly string[]
  ) => Effect.Effect<Array<PlantRow>, SqlError>
  readonly findPersonalReminderPlantIds: (
    userId: string
  ) => Effect.Effect<ReadonlyArray<string>, SqlError>
  readonly findById: (
    id: string
  ) => Effect.Effect<PlantWithRoom | null, SqlError>
  readonly update: (
    id: string,
    owner: PlantOwner,
    data: UpdatePlantData
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

// Filters decided per plant on its own care day, after the rows are loaded.
// SQL only prunes to plants with a care due soon.
const careFilters: Partial<
  Record<PlantFilter, (plant: PlantWithRoom) => boolean>
> = {
  overdue: hasOverdueCare,
  needsAttention: (plant) => plant.health === 'NEEDS_ATTENTION',
}

const careFilterOf = (filter: FindPlantsParams['filter']) =>
  Option.flatMap(Option.fromNullishOr(filter), (f) =>
    Option.fromNullishOr(careFilters[f])
  )

export const matchesCareFilter =
  (filter: FindPlantsParams['filter']) =>
  (plant: PlantWithRoom): boolean =>
    Option.match(careFilterOf(filter), {
      onNone: () => true,
      onSome: (matches) => matches(plant),
    })

// Build where-clause conditions from filter and room params
function buildPlantFilters(
  params: FindPlantsParams,
  db: Db,
  now: DateTime.DateTime
): ReturnType<typeof and>[] {
  const overdue = duePrune(DueWindow.Overdue(), now)
  const filterCondition = pipe(
    Match.value(params.filter),
    Match.when(
      (filter) => Option.isSome(careFilterOf(filter)),
      () =>
        Option.some(
          inArray(
            plants.id,
            db
              .select({ plantId: plantCareSchedules.plantId })
              .from(plantCareSchedules)
              .where(dueOnOrBefore(overdue.day, overdue.undatedBefore))
          )
        )
    ),
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

type CareInput = {
  careTimezone: string
  schedules: ReadonlyArray<StoredSchedule>
  now: DateTime.DateTime
}

// Map a DB row to an owned PlantWithRoom
function toOwnedPlant(
  row: { plant: RawPlant; room: RoomRef },
  care: CareInput
): PlantWithRoom {
  return {
    ...withUserOwner(row.plant),
    ...seePlantCare(row.plant, care.schedules, care.careTimezone, care.now),
    room: row.room,
    ownership: 'owned' as const,
    ownerName: null,
  }
}

// Map a DB row to a caretaking PlantWithRoom
function toCaretakingPlant(
  row: { plant: RawPlant; room: RoomRef; ownerName: string | null },
  care: CareInput
): PlantWithRoom {
  return {
    ...withUserOwner(row.plant),
    ...seePlantCare(row.plant, care.schedules, care.careTimezone, care.now),
    room: row.room,
    ownership: 'caretaking' as const,
    ownerName: row.ownerName,
  }
}

function toCanopyPlant(
  row: {
    plant: RawPlant
    room: RoomRef
    canopy: { name: string }
    creator: PlantCreator | null
  },
  care: CareInput
): PlantWithRoom {
  const plant = withCanopyOwner(row.plant)
  return {
    ...plant,
    ...seePlantCare(row.plant, care.schedules, care.careTimezone, care.now),
    room: row.room,
    ownership: 'canopy' as const,
    ownerName: null,
    canopy: { id: plant.owner.canopyId, name: row.canopy.name },
    createdBy: row.creator,
  }
}

const schedulesFor =
  (scheduleMap: Map<string, StoredSchedule[]>) => (plantId: string) =>
    pipe(
      Option.fromNullishOr(scheduleMap.get(plantId)),
      Option.getOrElse(() => [] as StoredSchedule[])
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
        return new Map<string, StoredSchedule[]>()
      }
      const rows = yield* db
        .select()
        .from(plantCareSchedules)
        .where(inArray(plantCareSchedules.plantId, [...plantIds]))

      const grouped = new Map<string, StoredSchedule[]>()
      Array.forEach(rows, (r) => {
        const existing = pipe(
          Option.fromNullishOr(grouped.get(r.plantId)),
          Option.getOrElse(() => [] as StoredSchedule[])
        )
        existing.push({
          careType: r.careType,
          frequencyDays: r.frequencyDays,
          lastCareAt: r.lastCareAt,
          nextCareAt: r.nextCareAt,
          dueDay: r.dueDay,
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
      orderBy: ReturnType<typeof buildPlantOrderBy>,
      now: DateTime.DateTime
    ) {
      const conditions = and(
        eq(careDelegations.caretakerId, params.userId),
        tending(),
        isNotNull(plants.userId),
        ...extraConditions
      )

      const rows = yield* db
        .select({
          plant: plants,
          room: roomSelect,
          ownerName: users.name,
          careTimezone: careTimezoneSql,
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
      return Array.map(rows, (row) =>
        toCaretakingPlant(row, {
          careTimezone: row.careTimezone,
          schedules: schedules(row.plant.id),
          now,
        })
      )
    })

    const findCanopyPlants = Effect.fn('PlantRepository.findCanopyPlants')(
      function* (
        params: FindPlantsParams,
        extraConditions: ReturnType<typeof and>[],
        orderBy: ReturnType<typeof buildPlantOrderBy>,
        now: DateTime.DateTime
      ) {
        const conditions = and(
          eq(canopyMembers.userId, params.userId),
          ...extraConditions
        )

        const rows = yield* db
          .select({
            plant: plants,
            room: roomSelect,
            canopy: canopySelect,
            creator: creatorSelect,
            careTimezone: careTimezoneSql,
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
        return Array.map(rows, (row) =>
          toCanopyPlant(row, {
            careTimezone: row.careTimezone,
            schedules: schedules(row.plant.id),
            now,
          })
        )
      }
    )

    return {
      findAll: Effect.fn('PlantRepository.findAll')(function* (
        params: FindPlantsParams
      ) {
        const { page, limit, offset } = getPaginationParams(params)
        const now = yield* DateTime.now
        const extraConditions = buildPlantFilters(params, db, now)
        const orderBy = buildPlantOrderBy(params.sort)

        const ownedRows = yield* db
          .select({
            plant: plants,
            room: roomSelect,
            careTimezone: careTimezoneSql,
          })
          .from(plants)
          .leftJoin(rooms, eq(plants.roomId, rooms.id))
          .where(and(eq(plants.userId, params.userId), ...extraConditions))
          .orderBy(...orderBy)

        const ownedSchedules = schedulesFor(
          yield* fetchSchedulesForPlants(
            Array.map(ownedRows, (r) => r.plant.id)
          )
        )
        const ownedItems = Array.map(ownedRows, (row) =>
          toOwnedPlant(row, {
            careTimezone: row.careTimezone,
            schedules: ownedSchedules(row.plant.id),
            now,
          })
        )

        const caretaking = params.includeCaretaking
          ? yield* findCaretakingPlants(params, extraConditions, orderBy, now)
          : []
        const canopy = params.includeCanopy
          ? yield* findCanopyPlants(params, extraConditions, orderBy, now)
          : []

        const allItems = pipe(
          ownedItems,
          Array.appendAll(caretaking),
          Array.appendAll(canopy),
          Array.filter(matchesCareFilter(params.filter))
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

        const paginated = pipe(sorted, Array.drop(offset), Array.take(limit))

        return paginate(paginated, Array.length(sorted), page, limit)
      }),

      findLivingByCanopy: Effect.fn('PlantRepository.findLivingByCanopy')(
        function* (canopyId: string) {
          const now = yield* DateTime.now
          const rows = yield* db
            .select({
              plant: plants,
              room: roomSelect,
              canopy: canopySelect,
              creator: creatorSelect,
              careTimezone: careTimezoneSql,
            })
            .from(plants)
            .innerJoin(canopies, eq(plants.canopyId, canopies.id))
            .leftJoin(rooms, eq(plants.roomId, rooms.id))
            .leftJoin(users, eq(plants.createdByUserId, users.id))
            .where(and(eq(plants.canopyId, canopyId), isLivingPlant()))
          const schedules = schedulesFor(
            yield* fetchSchedulesForPlants(Array.map(rows, (r) => r.plant.id))
          )
          return Array.map(rows, (row) =>
            toCanopyPlant(row, {
              careTimezone: row.careTimezone,
              schedules: schedules(row.plant.id),
              now,
            })
          )
        }
      ),

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

      findByIdsForKeyShare: Effect.fn('PlantRepository.findByIdsForKeyShare')(
        function* (ids: readonly string[]) {
          if (Array.isReadonlyArrayEmpty(ids)) return []
          const items = yield* db
            .select()
            .from(plants)
            .where(inArray(plants.id, [...ids]))
            .orderBy(asc(plants.id))
            .for('key share')
          return Array.map(items, withOwner)
        }
      ),

      findPersonalReminderPlantIds: Effect.fn(
        'PlantRepository.findPersonalReminderPlantIds'
      )(function* (userId: string) {
        const owned = yield* db
          .select({ id: plants.id })
          .from(plants)
          .where(eq(plants.userId, userId))
        const caredFor = yield* db
          .select({ id: delegationPlants.plantId })
          .from(delegationPlants)
          .innerJoin(
            careDelegations,
            eq(delegationPlants.delegationId, careDelegations.id)
          )
          .where(and(eq(careDelegations.caretakerId, userId), tending()))
        return Array.dedupe(Array.map([...owned, ...caredFor], (row) => row.id))
      }),

      findById: Effect.fn('PlantRepository.findById')(function* (id: string) {
        const [row] = yield* db
          .select({
            plant: plants,
            room: roomSelect,
            careTimezone: careTimezoneSql,
          })
          .from(plants)
          .leftJoin(rooms, eq(plants.roomId, rooms.id))
          .where(eq(plants.id, id))

        if (!row) return null

        const scheduleRows = yield* db
          .select()
          .from(plantCareSchedules)
          .where(eq(plantCareSchedules.plantId, id))
        const care: CareInput = {
          careTimezone: row.careTimezone,
          schedules: scheduleRows,
          now: yield* DateTime.now,
        }

        if (row.plant.canopyId === null) return toOwnedPlant(row, care)

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
        return toCanopyPlant({ ...row, ...scope }, care)
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
    }
  })
)
