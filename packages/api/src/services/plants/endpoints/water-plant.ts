import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { calculateScheduledAt } from '@lily/api/services/notifications/timezone-scheduler'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant, PlantWaterRequest } from '@lily/shared/plant'
import { DateTime, Duration, Effect, Option, pipe } from 'effect'

export const waterPlant = (
  request: PlantWaterRequest & { id: string }
): Effect.Effect<
  Plant,
  SqlError | PlantNotFoundError,
  PlantRepository | CareLogRepository | NotificationRepository | UserRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const notificationRepo = yield* NotificationRepository
    const userRepo = yield* UserRepository

    // First get the plant to calculate next watering date
    const plant = yield* repo.findById(request.id)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const nowDt = DateTime.unsafeNow()
    const now = DateTime.toDateUtc(nowDt)
    const nextWateringDt = DateTime.addDuration(
      nowDt,
      Duration.days(plant.wateringFrequencyDays)
    )
    const nextWateringAt = DateTime.toDateUtc(nextWateringDt)

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
      // Get user's timezone settings
      const user = yield* userRepo.findById(plant.userId)
      const timezone = pipe(
        Option.fromNullable(user),
        Option.flatMap((u) => Option.fromNullable(u.timezone)),
        Option.getOrNull
      )
      const preferredTime = pipe(
        Option.fromNullable(user),
        Option.flatMap((u) => Option.fromNullable(u.preferredNotificationTime)),
        Option.getOrNull
      )

      // Calculate the scheduled time in user's timezone
      const scheduledAt = yield* calculateScheduledAt(
        nextWateringAt,
        timezone,
        preferredTime
      )

      // Remove any existing pending reminder for this plant
      yield* notificationRepo.deletePendingByPlantAndType(
        request.id,
        'watering_reminder'
      )

      // Create new reminder with timezone-aware scheduling
      yield* notificationRepo.create({
        type: 'watering_reminder',
        title: `Time to water your ${plant.name}`,
        body: `Your ${plant.name} needs watering today.`,
        scheduledAt,
        userId: plant.userId,
        plantId: request.id,
      })
    }

    return updatedPlant
  })
