import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant, PlantWaterRequest } from '@lily/shared/plant'
import { Duration, Effect } from 'effect'

export const waterPlant = (
  request: PlantWaterRequest & { id: string }
): Effect.Effect<
  Plant,
  SqlError | PlantNotFoundError,
  PlantRepository | CareLogRepository | NotificationRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const notificationRepo = yield* NotificationRepository

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

    // Schedule next watering reminder if reminders are enabled
    if (plant.remindersEnabled) {
      // Remove any existing pending reminder for this plant
      yield* notificationRepo.deletePendingByPlantAndType(
        request.id,
        'watering_reminder'
      )

      // Create new reminder
      yield* notificationRepo.create({
        type: 'watering_reminder',
        title: `Time to water your ${plant.name}`,
        body: `Your ${plant.name} needs watering today.`,
        scheduledAt: nextWateringAt,
        userId: plant.userId,
        plantId: request.id,
      })
    }

    return updatedPlant
  })
