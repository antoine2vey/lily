import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type {
  PlantByIdRequest,
  PlantByUserIdRequest,
  PlantCreateRequest,
  PlantDeleteRequest,
  PlantUpdateRequest,
  PlantWaterRequest,
} from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect, pipe, Record } from 'effect'

const findPlants = Effect.gen(function* () {
  const db = yield* Database

  yield* Effect.log('Finding plants')

  const plants = yield* Effect.tryPromise({
    try: () =>
      db.client.plant.findMany({
        select: plantSelector,
      }),
    catch: () => new DatabaseError(),
  })

  yield* Effect.log(plants)

  return plants
})

const findPlantById = (request: PlantByIdRequest) =>
  Effect.gen(function* () {
    const db = yield* Database

    const plant = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.findUnique({
          where: { id: request.id },
          select: plantSelector,
        }),
      catch: () => new DatabaseError(),
    })

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return plant
  })

const findPlantsByUserId = (request: PlantByUserIdRequest) =>
  Effect.gen(function* () {
    const db = yield* Database
    const plants = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.findMany({
          where: { userId: request.userId },
          select: plantSelector,
        }),
      catch: () => new DatabaseError(),
    })

    return plants
  })

const createPlant = (request: PlantCreateRequest) =>
  Effect.gen(function* () {
    const db = yield* Database

    const plant = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.create({
          data: {
            name: request.name,
            description: request.description || null,
            imageUrl: request.imageUrl || null,
            category: request.category || null,
            humidityRating: request.humidityRating,
            lightingRating: request.lightingRating,
            petToxicityRating: request.petToxicityRating,
            wateringRating: request.wateringRating,
            wateringFrequencyDays: request.wateringFrequencyDays,
            userId: request.userId,
          },
          select: plantSelector,
        }),
      catch: () => new DatabaseError(),
    })

    return plant
  })

const updatePlant = (request: PlantUpdateRequest) =>
  Effect.gen(function* () {
    const db = yield* Database
    const data = pipe(
      Object.entries(request),
      Record.fromEntries,
      Record.remove('id'),
      Record.filter((_, value) => value !== undefined)
    )

    const plant = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.update({
          where: { id: request.id },
          data,
          select: plantSelector,
        }),
      catch: () => new DatabaseError(),
    })

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return plant
  })

const deletePlant = (request: PlantDeleteRequest) =>
  Effect.gen(function* () {
    const db = yield* Database

    const plant = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.delete({
          where: { id: request.id },
          select: plantSelector,
        }),
      catch: () => new DatabaseError(),
    })

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return plant
  })

const waterPlant = (request: PlantWaterRequest) =>
  Effect.gen(function* () {
    const db = yield* Database

    // First get the plant to calculate next watering date
    const plant = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.findUnique({
          where: { id: request.id },
          select: plantSelector,
        }),
      catch: () => new DatabaseError(),
    })

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const now = new Date()
    const nextWateringAt = new Date(
      now.getTime() + plant.wateringFrequencyDays * 24 * 60 * 60 * 1000
    )

    // Update the plant with watering info
    const updatedPlant = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.update({
          where: { id: request.id },
          data: {
            lastWateredAt: now,
            nextWateringAt,
          },
          select: plantSelector,
        }),
      catch: () => new DatabaseError(),
    })

    // Create watering history record
    yield* Effect.tryPromise({
      try: () =>
        db.client.wateringHistory.create({
          data: {
            plantId: request.id,
            notes: request.notes || null,
          },
        }),
      catch: () => new DatabaseError(),
    })

    return updatedPlant
  })

// Plant service implementation
export class PlantsService extends Effect.Service<PlantsService>()(
  'PlantsService',
  {
    effect: Effect.succeed({
      findPlants,
      findPlantById,
      findPlantsByUserId,
      createPlant,
      updatePlant,
      deletePlant,
      waterPlant,
    }),
  }
) {}
