import {
  PlantRepository,
  type IPlantRepository,
  type FindPlantsParams,
} from '@lily/api/repositories/plant.repository'
import type { PlantPhoto } from '@lily/shared/plant'
import type { plants } from '@lily/db'
import { Effect, Layer } from 'effect'

type PlantRecord = typeof plants.$inferSelect

interface MockPlantRepositoryData {
  plants: PlantRecord[]
  photos?: PlantPhoto[]
}

export const createMockPlantRepository = (
  data: MockPlantRepositoryData
): Layer.Layer<PlantRepository> => {
  const { plants, photos = [] } = data

  const repo: IPlantRepository = {
    findAll: (params: FindPlantsParams) => {
      const page = params.page ?? 1
      const limit = params.limit ?? 10
      const offset = (page - 1) * limit

      let filtered = [...plants]

      if (params.userId) {
        filtered = filtered.filter((p) => p.userId === params.userId)
      }

      if (params.filter === 'needsAttention') {
        filtered = filtered.filter((p) => p.health === 'NEEDS_ATTENTION')
      }

      if (params.sort === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name))
      } else {
        filtered.sort(
          (a, b) => b.dateAdded.getTime() - a.dateAdded.getTime()
        )
      }

      const paginated = filtered.slice(offset, offset + limit)

      return Effect.succeed({
        plants: paginated,
        total: filtered.length,
        page,
        limit,
      })
    },

    findById: (id: string) =>
      Effect.succeed(plants.find((p) => p.id === id) ?? null),

    create: (data) => {
      const newPlant: PlantRecord = {
        id: `plant-${crypto.randomUUID()}`,
        name: data.name,
        description: data.description,
        imageUrl: null,
        category: data.category,
        dateAdded: new Date(),
        updatedAt: new Date(),
        humidityRating: data.humidityRating,
        lightingRating: data.lightingRating,
        petToxicityRating: data.petToxicityRating,
        wateringRating: data.wateringRating,
        health: data.health,
        wateringFrequencyDays: data.wateringFrequencyDays,
        lastWateredAt: null,
        nextWateringAt: null,
        remindersEnabled: true,
        fertilizationFrequencyDays: null,
        lastFertilizedAt: null,
        nextFertilizationAt: null,
        userId: data.userId,
      }
      return Effect.succeed(newPlant)
    },

    update: (id, data) => {
      const plant = plants.find((p) => p.id === id)
      if (!plant) return Effect.succeed(null)
      return Effect.succeed({ ...plant, ...data, updatedAt: new Date() })
    },

    delete: (id) => {
      const plant = plants.find((p) => p.id === id)
      return Effect.succeed(plant ?? null)
    },

    findPhotos: (plantId: string) =>
      Effect.succeed(photos.filter((p) => p.plantId === plantId)),

    addPhoto: (plantId: string, url: string) => {
      const newPhoto: PlantPhoto = {
        id: `photo-${crypto.randomUUID()}`,
        url,
        takenAt: new Date(),
        plantId,
      }
      return Effect.succeed(newPhoto)
    },

    addPhotos: () => Effect.succeed(undefined),

    deletePhoto: (photoId: string) => {
      const photo = photos.find((p) => p.id === photoId)
      return Effect.succeed(photo ?? null)
    },

    deletePhotoByPlantId: () => Effect.succeed(undefined),
  }

  return Layer.succeed(PlantRepository, repo)
}
