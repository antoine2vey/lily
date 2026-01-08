import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant } from '@lily/shared/plant'
import { Duration, Effect } from 'effect'

export const fertilizePlant = (request: {
  id: string
}): Effect.Effect<
  Plant,
  SqlError | PlantNotFoundError,
  PlantRepository | CareLogRepository | NotificationRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const notificationRepo = yield* NotificationRepository

    // Get plant first
    const plant = yield* repo.findById(request.id)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const now = new Date()

    // Calculate next fertilization date if frequency is set
    const nextFertilizationAt = plant.fertilizationFrequencyDays
      ? new Date(
          now.getTime() +
            Duration.toMillis(Duration.days(plant.fertilizationFrequencyDays))
        )
      : undefined

    // Update plant
    const updatedPlant = yield* repo.update(request.id, {
      lastFertilizedAt: now,
      ...(nextFertilizationAt && { nextFertilizationAt }),
    })

    if (!updatedPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    // Create care log
    yield* careLogRepo.create({
      type: 'fertilization',
      plantId: request.id,
      date: now,
    })

    // Schedule next fertilization reminder if enabled and frequency is set
    if (plant.remindersEnabled && nextFertilizationAt) {
      // Remove any existing pending reminder for this plant
      yield* notificationRepo.deletePendingByPlantAndType(
        request.id,
        'fertilization_reminder'
      )

      // Create new reminder
      yield* notificationRepo.create({
        type: 'fertilization_reminder',
        title: `Time to fertilize your ${plant.name}`,
        body: `Your ${plant.name} needs fertilizing today.`,
        scheduledAt: nextFertilizationAt,
        userId: plant.userId,
        plantId: request.id,
      })
    }

    return updatedPlant
  })
