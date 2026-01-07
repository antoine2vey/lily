import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant, PlantWaterRequest } from '@lily/shared/plant'
import { Duration, Effect } from 'effect'

export const waterPlant = (
  request: PlantWaterRequest & { id: string }
): Effect.Effect<
  Plant,
  SqlError | PlantNotFoundError,
  PlantRepository | CareLogRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository

    // First get the plant to calculate next watering date
    const plant = yield* repo.findById(request.id)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const now = new Date()
    const nextWateringAt = new Date(
      now.getTime() +
        Duration.toMillis(Duration.days(plant.wateringFrequencyDays))
    )

    // Update the plant with watering info
    const updatedPlant = yield* repo.update(request.id, {
      lastWateredAt: now,
      nextWateringAt,
    })

    if (!updatedPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    // Create care log record for watering
    yield* careLogRepo.create({
      type: 'watering',
      plantId: request.id,
      notes: request.notes,
      date: now,
    })

    return updatedPlant
  })
