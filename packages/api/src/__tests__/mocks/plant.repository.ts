import {
  type FindPhotosParams,
  type FindPlantsParams,
  type IPlantRepository,
  PlantRepository,
} from '@lily/api/repositories/plant.repository'
import type { plants } from '@lily/db'
import { endOfDay, paginate } from '@lily/shared'
import type { PlantPhoto } from '@lily/shared/plant'
import { Array, DateTime, Effect, Layer, Option, pipe } from 'effect'

type PlantRecord = typeof plants.$inferSelect

interface MockRoom {
  id: string
  name: string
  icon: string
  luminosity: number | null
  isOutdoor: boolean
}

interface MockPlantRepositoryData {
  plants: PlantRecord[]
  photos?: PlantPhoto[]
  rooms?: MockRoom[]
}

export const createMockPlantRepository = (
  data: MockPlantRepositoryData
): Layer.Layer<PlantRepository> => {
  // Shallow copy each plant so mutations don't leak between tests
  const plantsData: PlantRecord[] = Array.map(data.plants, (p) => ({ ...p }))
  // Keep a reference to the original array for health scheduler mutations
  const originalPlantsData = data.plants
  const photos = data.photos ?? []
  const rooms = data.rooms ?? []

  const resolveRoom = (roomId: string | null) =>
    pipe(
      Option.fromNullable(roomId),
      Option.flatMap((id) => Array.findFirst(rooms, (r) => r.id === id)),
      Option.getOrNull
    )

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

      if (params.sort === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name))
      } else {
        filtered.sort((a, b) => b.dateAdded.getTime() - a.dateAdded.getTime())
      }

      const items = filtered.slice(offset, offset + limit)
      const total = filtered.length

      const itemsWithRoom = Array.map(items, (p) => ({
        ...p,
        room: resolveRoom(p.roomId),
      }))

      return Effect.succeed({
        items: itemsWithRoom,
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
          Option.map((p) => ({ ...p, room: resolveRoom(p.roomId) })),
          Option.getOrNull
        )
      ),

    findPlantsWithPendingCare: (userId: string, endOfWeek: Date) => {
      const filtered = Array.filter(plantsData, (p) => {
        if (p.userId !== userId) return false

        const wateringDue = pipe(
          Option.fromNullable(p.nextWateringAt),
          Option.map((d) => d.getTime() <= endOfWeek.getTime()),
          Option.getOrElse(() => false)
        )

        const fertilizationDue = pipe(
          Option.fromNullable(p.nextFertilizationAt),
          Option.map((d) => d.getTime() <= endOfWeek.getTime()),
          Option.getOrElse(() => false)
        )

        return wateringDue || fertilizationDue
      })

      return Effect.succeed(
        Array.map(filtered, (p) => ({ ...p, room: resolveRoom(p.roomId) }))
      )
    },

    create: (createData) => {
      const newPlant: PlantRecord = {
        id: `plant-${crypto.randomUUID()}`,
        name: createData.name,
        description: createData.description,
        imageUrl: createData.imageUrl ?? null,
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
        fertilizationFrequencyDays:
          createData.fertilizationFrequencyDays ?? null,
        lastFertilizedAt: null,
        nextFertilizationAt: null,
        isFavorite: false,
        roomId: createData.roomId ?? null,
        userId: createData.userId,
      }
      return Effect.succeed(newPlant)
    },

    update: (id, updateData) => {
      const idx = plantsData.findIndex((p) => p.id === id)
      if (idx === -1) return Effect.succeed(null)
      const existing = plantsData[idx]
      if (!existing) return Effect.succeed(null)
      const updated = {
        ...existing,
        ...updateData,
        updatedAt: new Date(),
      }
      plantsData[idx] = updated
      // Also propagate to original data so callers can observe the change
      const origIdx = originalPlantsData.findIndex((p) => p.id === id)
      const origPlant = originalPlantsData[origIdx]
      if (origIdx !== -1 && origPlant) {
        Object.assign(origPlant, updateData)
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
      const total = filtered.length
      const items = filtered.slice(offset, offset + limit)

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
