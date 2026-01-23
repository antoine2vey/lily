import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { calculateScheduledAt } from '@lily/api/services/notifications/timezone-scheduler'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant } from '@lily/shared/plant'
import { DateTime, Duration, Effect, Option, pipe } from 'effect'

export const fertilizePlant = (request: {
  id: string
}): Effect.Effect<
  Plant,
  SqlError | PlantNotFoundError,
  PlantRepository | CareLogRepository | NotificationRepository | UserRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const notificationRepo = yield* NotificationRepository
    const userRepo = yield* UserRepository

    // Get plant first
    const plant = yield* repo.findById(request.id)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const nowDt = DateTime.unsafeNow()
    const now = DateTime.toDateUtc(nowDt)

    // Calculate next fertilization date if frequency is set
    const nextFertilizationAt = pipe(
      Option.fromNullable(plant.fertilizationFrequencyDays),
      Option.map((days) =>
        DateTime.toDateUtc(DateTime.addDuration(nowDt, Duration.days(days)))
      ),
      Option.getOrUndefined
    )

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
        nextFertilizationAt,
        timezone,
        preferredTime
      )

      // Remove any existing pending reminder for this plant
      yield* notificationRepo.deletePendingByPlantAndType(
        request.id,
        'fertilization_reminder'
      )

      // Create new reminder with timezone-aware scheduling
      yield* notificationRepo.create({
        type: 'fertilization_reminder',
        title: `Time to fertilize your ${plant.name}`,
        body: `Your ${plant.name} needs fertilizing today.`,
        scheduledAt,
        userId: plant.userId,
        plantId: request.id,
      })
    }

    return updatedPlant
  })
