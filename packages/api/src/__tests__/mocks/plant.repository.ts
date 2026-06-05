import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import {
  type FindPhotosParams,
  type FindPlantsParams,
  type IPlantRepository,
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { plants } from '@lily/db/schema'
import { endOfDay, type Orientation, paginate } from '@lily/shared'
import type { PlantPhoto } from '@lily/shared/plant'
import { Array, DateTime, Effect, Layer, Option, Order, pipe } from 'effect'

type PlantRecord = typeof plants.$inferSelect

interface MockRoom {
  id: string
  name: string
  icon: string
  luminosity: number | null
  orientation?: Orientation | null
  isOutdoor: boolean
}

export interface MockCaretakingPlant {
  plant: PlantRecord
  ownerName: string | null
}

interface MockPlantRepositoryData {
  plants: PlantRecord[]
  photos?: PlantPhoto[]
  rooms?: MockRoom[]
  caretakingPlants?: MockCaretakingPlant[]
  schedules?: CareScheduleRow[]
}

export const createMockPlantRepository = (
  data: MockPlantRepositoryData
): Layer.Layer<PlantRepository> => {
  // Shallow copy each plant so mutations don't leak between tests
  const plantsData: PlantRecord[] = Array.map(data.plants, (p) => ({ ...p }))
  // Keep a reference to the original array for health scheduler mutations
  const originalPlantsData = data.plants
  const photos = Option.getOrElse(
    Option.fromNullable(data.photos),
    () => [] as PlantPhoto[]
  )
  const rooms = Option.getOrElse(
    Option.fromNullable(data.rooms),
    () => [] as MockRoom[]
  )
  const caretakingPlants = Option.getOrElse(
    Option.fromNullable(data.caretakingPlants),
    () => [] as MockCaretakingPlant[]
  )
  const schedulesData = Option.getOrElse(
    Option.fromNullable(data.schedules),
    () => [] as CareScheduleRow[]
  )

  const resolveRoom = (roomId: string | null) =>
    pipe(
      Option.fromNullable(roomId),
      Option.flatMap((id) => Array.findFirst(rooms, (r) => r.id === id)),
      Option.map((r) => ({
        ...r,
        orientation: Option.getOrNull(Option.fromNullable(r.orientation)),
      })),
      Option.getOrNull
    )

  const applyFilters = (
    items: PlantRecord[],
    params: FindPlantsParams
  ): PlantRecord[] => {
    let filtered = items

    if (params.filter === 'needsAttention') {
      filtered = Array.filter(filtered, (p) => p.health === 'NEEDS_ATTENTION')
    }

    if (params.filter === 'overdue') {
      const endOfTodayDt = endOfDay(DateTime.unsafeNow(), params.timezone)
      const endOfTodayMs = DateTime.toEpochMillis(endOfTodayDt)
      // Check schedule table for overdue plants
      filtered = Array.filter(filtered, (p) =>
        Array.some(
          schedulesData,
          (s) =>
            s.plantId === p.id &&
            s.nextCareAt !== null &&
            s.nextCareAt.getTime() <= Number(endOfTodayMs)
        )
      )
    }

    return filtered
  }

  const repo: IPlantRepository = {
    findAll: (params: FindPlantsParams) => {
      const page = pipe(
        Option.fromNullable(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullable(params.limit),
        Option.getOrElse(() => 20)
      )
      const offset = (page - 1) * limit

      let filtered = [...plantsData]

      if (params.userId) {
        filtered = Array.filter(filtered, (p) => p.userId === params.userId)
      }

      filtered = applyFilters(filtered, params)

      const ownedItems: PlantWithRoom[] = Array.map(filtered, (p) => ({
        ...p,
        room: resolveRoom(p.roomId),
        ownership: 'owned' as const,
        ownerName: null,
        schedules: [],
      }))

      // Add caretaking plants when requested
      const caretakingItems: PlantWithRoom[] =
        params.includeCaretaking &&
        Array.isNonEmptyReadonlyArray(caretakingPlants)
          ? pipe(
              Array.map(caretakingPlants, (cp) => cp.plant),
              (plants) => applyFilters(plants, params),
              Array.map((p) => ({
                ...p,
                room: resolveRoom(p.roomId),
                ownership: 'caretaking' as const,
                ownerName: pipe(
                  Array.findFirst(
                    caretakingPlants,
                    (cp) => cp.plant.id === p.id
                  ),
                  Option.map((cp) => cp.ownerName),
                  Option.getOrNull
                ),
                schedules: [],
              }))
            )
          : []

      const allItems = Array.appendAll(ownedItems, caretakingItems)

      const sortOrder =
        params.sort === 'name'
          ? Order.mapInput(Order.string, (p: PlantWithRoom) => p.name)
          : Order.mapInput(Order.reverse(Order.number), (p: PlantWithRoom) =>
              p.dateAdded.getTime()
            )
      const sorted = Array.sort(allItems, sortOrder)

      const total = Array.length(sorted)
      const items = pipe(sorted, Array.drop(offset), Array.take(limit))

      return Effect.succeed({
        items,
        total,
        page,
        limit,
        hasMore: page * limit < total,
      })
    },

    findByIds: (ids: readonly string[]) =>
      Effect.succeed(
        Array.filter(plantsData, (p) => Array.contains(ids, p.id))
      ),

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(plantsData, (p) => p.id === id),
          Option.map((p) => ({
            ...p,
            room: resolveRoom(p.roomId),
            ownership: 'owned' as const,
            ownerName: null,
            schedules: [],
          })),
          Option.getOrNull
        )
      ),

    create: (createData) => {
      const newPlant: PlantRecord = {
        id: `plant-${crypto.randomUUID()}`,
        name: createData.name,
        description: createData.description,
        imageUrl: Option.getOrNull(Option.fromNullable(createData.imageUrl)),
        category: createData.category,
        dateAdded: new Date(),
        updatedAt: new Date(),
        humidityRating: createData.humidityRating,
        lightingRating: createData.lightingRating,
        petToxicityRating: createData.petToxicityRating,
        wateringRating: createData.wateringRating,
        health: createData.health,
        remindersEnabled: true,
        isFavorite: false,
        potWidthCm: null,
        potHeightCm: null,
        roomId: Option.getOrNull(Option.fromNullable(createData.roomId)),
        userId: createData.userId,
      }
      plantsData.push(newPlant)
      return Effect.succeed(newPlant)
    },

    update: (id, updateData) => {
      const idxOption = Array.findFirstIndex(plantsData, (p) => p.id === id)
      if (Option.isNone(idxOption)) return Effect.succeed(null)
      const idx = idxOption.value
      const existing = plantsData[idx]
      if (!existing) return Effect.succeed(null)
      const updated = {
        ...existing,
        ...updateData,
        updatedAt: new Date(),
      }
      plantsData[idx] = updated
      // Also propagate to original data so callers can observe the change
      const origIdxOption = Array.findFirstIndex(
        originalPlantsData,
        (p) => p.id === id
      )
      if (Option.isSome(origIdxOption)) {
        const origPlant = originalPlantsData[origIdxOption.value]
        if (origPlant) {
          Object.assign(origPlant, updateData)
        }
      }
      return Effect.succeed(updated)
    },

    delete: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(plantsData, (p) => p.id === id),
          Option.getOrNull
        )
      ),

    findPhotos: (params: FindPhotosParams) => {
      const page = pipe(
        Option.fromNullable(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullable(params.limit),
        Option.getOrElse(() => 20)
      )
      const offset = (page - 1) * limit

      const filtered = Array.filter(photos, (p) => p.plantId === params.plantId)
      const total = Array.length(filtered)
      const items = pipe(filtered, Array.drop(offset), Array.take(limit))

      return Effect.succeed(paginate(items, total, page, limit))
    },

    addPhoto: (plantId: string, url: string) => {
      const newPhoto: PlantPhoto = {
        id: `photo-${crypto.randomUUID()}`,
        url,
        takenAt: new Date(),
        plantId,
      }
      return Effect.succeed(newPhoto)
    },

    addPhotos: (photosData) =>
      Effect.succeed(
        Array.map(photosData, (p) => ({
          id: `photo-${crypto.randomUUID()}`,
          url: p.url,
          takenAt: p.takenAt,
          plantId: p.plantId,
        }))
      ),

    deletePhoto: (photoId: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(photos, (p) => p.id === photoId),
          Option.getOrNull
        )
      ),

    deletePhotoByPlantId: () => Effect.void,

    markOverduePlantsAsNeedsAttention: () => {
      const now = new Date()

      const hasOverdue = (plantId: string) =>
        Array.some(
          schedulesData,
          (s) =>
            s.plantId === plantId &&
            s.nextCareAt !== null &&
            s.nextCareAt.getTime() <= now.getTime()
        )

      const shouldMark = (plant: PlantRecord) =>
        hasOverdue(plant.id) &&
        (plant.health === 'HEALTHY' || plant.health === 'THRIVING')

      const matched = Array.filter(plantsData, shouldMark)
      Array.forEach(matched, (p) => {
        p.health = 'NEEDS_ATTENTION'
      })

      // Also mutate original array for tests that check it directly
      pipe(
        Array.filter(originalPlantsData, shouldMark),
        Array.forEach((p) => {
          p.health = 'NEEDS_ATTENTION'
        })
      )

      return Effect.succeed(Array.length(matched))
    },

    markHealthyPlantsInOrder: () => {
      const now = new Date()

      const hasOverdue = (plantId: string) =>
        Array.some(
          schedulesData,
          (s) =>
            s.plantId === plantId &&
            s.nextCareAt !== null &&
            s.nextCareAt.getTime() <= now.getTime()
        )

      const shouldMark = (plant: PlantRecord) =>
        plant.health === 'NEEDS_ATTENTION' && !hasOverdue(plant.id)

      const matched = Array.filter(plantsData, shouldMark)
      Array.forEach(matched, (p) => {
        p.health = 'HEALTHY'
      })

      // Also mutate original array for tests that check it directly
      pipe(
        Array.filter(originalPlantsData, shouldMark),
        Array.forEach((p) => {
          p.health = 'HEALTHY'
        })
      )

      return Effect.succeed(Array.length(matched))
    },
  }

  return Layer.succeed(PlantRepository, repo)
}
