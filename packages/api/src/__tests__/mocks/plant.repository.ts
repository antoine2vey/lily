import {
  type FindPhotosParams,
  type FindPlantsParams,
  type IPlantRepository,
  PlantRepository,
} from '@lily/api/repositories/plant.repository'
import type { plants } from '@lily/db'
import { paginate } from '@lily/shared'
import type { PlantPhoto } from '@lily/shared/plant'
import { Array, Effect, Layer, Option, pipe } from 'effect'

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
      const page = pipe(
        Option.fromNullable(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullable(params.limit),
        Option.getOrElse(() => 20)
      )
      const offset = (page - 1) * limit

      let filtered = [...plants]

      if (params.userId) {
        filtered = Array.filter(filtered, (p) => p.userId === params.userId)
      }

      if (params.filter === 'needsAttention') {
        filtered = Array.filter(filtered, (p) => p.health === 'NEEDS_ATTENTION')
      }

      if (params.sort === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name))
      } else {
        filtered.sort((a, b) => b.dateAdded.getTime() - a.dateAdded.getTime())
      }

      const items = filtered.slice(offset, offset + limit)
      const total = filtered.length

      return Effect.succeed({
        items,
        total,
        page,
        limit,
        hasMore: page * limit < total,
      })
    },

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(plants, (p) => p.id === id),
          Option.getOrNull
        )
      ),

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
      const plantOption = Array.findFirst(plants, (p) => p.id === id)
      return Option.match(plantOption, {
        onNone: () => Effect.succeed(null),
        onSome: (plant) =>
          Effect.succeed({ ...plant, ...data, updatedAt: new Date() }),
      })
    },

    delete: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(plants, (p) => p.id === id),
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
  }

  return Layer.succeed(PlantRepository, repo)
}
