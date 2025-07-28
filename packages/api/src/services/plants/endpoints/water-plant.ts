import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { PlantWaterRequest } from '@lily/shared/plant'
import { plantSelector } from '@lily/shared/selectors/plant'
import { Effect } from 'effect'
import { transformPlant } from '../utils'

export const waterPlant = (request: PlantWaterRequest & { id: string }) =>
  Effect.gen(function* () {
    const db = yield* Database

    // First get the plant to calculate next watering date
    const rawPlant = yield* Effect.tryPromise({
      try: () =>
        db.client.plant.findUnique({
          where: { id: request.id },
          select: plantSelector,
        }),
      catch: () => new DatabaseError(),
    })

    if (!rawPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const now = new Date()
    const nextWateringAt = new Date(
      now.getTime() + rawPlant.wateringFrequencyDays * 24 * 60 * 60 * 1000
    )

    // Update the plant with watering info
    const updatedRawPlant = yield* Effect.tryPromise({
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

    return transformPlant(updatedRawPlant)
  })
