import {
  type FindPhotosParams,
  type FindPlantsParams,
  type IPlantRepository,
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { plants } from '@lily/db/schema'
import { earliestOverdueDate, endOfDay, paginate } from '@lily/shared'
import type { PlantPhoto } from '@lily/shared/plant'
import { Array, DateTime, Effect, Layer, Option, Order, pipe } from 'effect'

type PlantRecord = typeof plants.$inferSelect

interface MockRoom {
  id: string
  name: string
  icon: string
  luminosity: number | null
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

  const resolveRoom = (roomId: string | null) =>
    pipe(
      Option.fromNullable(roomId),
      Option.flatMap((id) => Array.findFirst(rooms, (r) => r.id === id)),
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
      filtered = Array.filter(
        filtered,
        (p) =>
          p.nextWateringAt !== null &&
          p.nextWateringAt.getTime() <= Number(endOfTodayMs)
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
          })),
          Option.getOrNull
        )
      ),

    findPlantsWithPendingCare: (userId: string, cutoffDate: Date) => {
      const filtered = Array.filter(plantsData, (p) => {
        if (p.userId !== userId) return false

        const wateringDue = pipe(
          Option.fromNullable(p.nextWateringAt),
          Option.map((d) => d.getTime() <= cutoffDate.getTime()),
          Option.getOrElse(() => false)
        )

        const fertilizationDue = pipe(
          Option.fromNullable(p.nextFertilizationAt),
          Option.map((d) => d.getTime() <= cutoffDate.getTime()),
          Option.getOrElse(() => false)
        )

        return wateringDue || fertilizationDue
      })

      return Effect.succeed(
        Array.map(filtered, (p) => ({
          ...p,
          room: resolveRoom(p.roomId),
          ownership: 'owned' as const,
          ownerName: null,
        }))
      )
    },

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
        wateringFrequencyDays: createData.wateringFrequencyDays,
        lastWateredAt: null,
        nextWateringAt: null,
        remindersEnabled: true,
        fertilizationFrequencyDays: Option.getOrNull(
          Option.fromNullable(createData.fertilizationFrequencyDays)
        ),
        lastFertilizedAt: null,
        nextFertilizationAt: null,
        isFavorite: false,
        roomId: Option.getOrNull(Option.fromNullable(createData.roomId)),
        userId: createData.userId,
      }
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

    deletePhotoByPlantId: () => Effect.succeed(undefined),

    markOverduePlantsAsNeedsAttention: () => {
      const now = new Date()
      let count = 0
      for (const plant of plantsData) {
        const wateringOverdue =
          plant.nextWateringAt !== null &&
          plant.nextWateringAt.getTime() <= now.getTime()
        const fertilizationOverdue =
          plant.nextFertilizationAt !== null &&
          plant.nextFertilizationAt.getTime() <= now.getTime()

        if (
          (wateringOverdue || fertilizationOverdue) &&
          (plant.health === 'HEALTHY' || plant.health === 'THRIVING')
        ) {
          plant.health = 'NEEDS_ATTENTION'
          count++
        }
      }
      // Also mutate original array for tests that check it directly
      for (const plant of originalPlantsData) {
        const wateringOverdue =
          plant.nextWateringAt !== null &&
          plant.nextWateringAt.getTime() <= now.getTime()
        const fertilizationOverdue =
          plant.nextFertilizationAt !== null &&
          plant.nextFertilizationAt.getTime() <= now.getTime()

        if (
          (wateringOverdue || fertilizationOverdue) &&
          (plant.health === 'HEALTHY' || plant.health === 'THRIVING')
        ) {
          plant.health = 'NEEDS_ATTENTION'
        }
      }
      return Effect.succeed(count)
    },

    findOverduePlantsByUser: () => {
      const now = new Date()
      const overdue = Array.filter(
        plantsData,
        (p) =>
          (p.nextWateringAt !== null &&
            p.nextWateringAt.getTime() <= now.getTime()) ||
          (p.nextFertilizationAt !== null &&
            p.nextFertilizationAt.getTime() <= now.getTime())
      )
      const mapped = Array.map(overdue, (p) => ({
        id: p.id,
        name: p.name,
        userId: p.userId,
        overdueAt: earliestOverdueDate(
          [p.nextWateringAt, p.nextFertilizationAt],
          now
        ),
      }))
      return Effect.succeed(Array.groupBy(mapped, (p) => p.userId))
    },

    markHealthyPlantsInOrder: () => {
      const now = new Date()
      let count = 0
      for (const plant of plantsData) {
        const wateringOk =
          plant.nextWateringAt === null ||
          plant.nextWateringAt.getTime() > now.getTime()
        const fertilizationOk =
          plant.nextFertilizationAt === null ||
          plant.nextFertilizationAt.getTime() > now.getTime()

        if (
          plant.health === 'NEEDS_ATTENTION' &&
          wateringOk &&
          fertilizationOk
        ) {
          plant.health = 'HEALTHY'
          count++
        }
      }
      // Also mutate original array for tests that check it directly
      for (const plant of originalPlantsData) {
        const wateringOk =
          plant.nextWateringAt === null ||
          plant.nextWateringAt.getTime() > now.getTime()
        const fertilizationOk =
          plant.nextFertilizationAt === null ||
          plant.nextFertilizationAt.getTime() > now.getTime()

        if (
          plant.health === 'NEEDS_ATTENTION' &&
          wateringOk &&
          fertilizationOk
        ) {
          plant.health = 'HEALTHY'
        }
      }
      return Effect.succeed(count)
    },
  }

  return Layer.succeed(PlantRepository, repo)
}
