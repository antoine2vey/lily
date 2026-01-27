import * as SqlClient from '@effect/sql/SqlClient'
import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { calculateScheduledAt } from '@lily/api/services/notifications/timezone-scheduler'
import type { PlantNotFoundError } from '@lily/shared/errors/plant'
import type {
  WaterMultiplePlantsRequest,
  WaterMultiplePlantsResponse,
} from '@lily/shared/plant'
import { Array, DateTime, Duration, Effect, Option, pipe } from 'effect'

export const waterMultiplePlants = (
  request: WaterMultiplePlantsRequest
): Effect.Effect<
  WaterMultiplePlantsResponse,
  SqlError | PlantNotFoundError,
  | PlantRepository
  | CareLogRepository
  | NotificationRepository
  | UserRepository
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const repo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const notificationRepo = yield* NotificationRepository
    const userRepo = yield* UserRepository

    if (request.plantIds.length === 0) {
      return []
    }

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        // 1. Batch fetch all plants
        const foundPlants = yield* repo.findByIds(request.plantIds)

        const nowDt = DateTime.unsafeNow()
        const now = DateTime.toDateUtc(nowDt)

        // 2. Update each plant in parallel
        const results = yield* Effect.forEach(
          request.plantIds,
          (plantId) =>
            Effect.gen(function* () {
              const plantOption = Array.findFirst(
                foundPlants,
                (p) => p.id === plantId
              )

              return yield* Option.match(plantOption, {
                onNone: () =>
                  Effect.succeed({
                    plantId,
                    success: false,
                    plant: undefined,
                  }),
                onSome: (plant) =>
                  Effect.gen(function* () {
                    const nextWateringDt = DateTime.addDuration(
                      nowDt,
                      Duration.days(plant.wateringFrequencyDays)
                    )
                    const nextWateringAt = DateTime.toDateUtc(nextWateringDt)

                    const updatedPlant = yield* repo.update(plantId, {
                      lastWateredAt: now,
                      nextWateringAt,
                    })

                    // Schedule reminder if enabled
                    if (plant.remindersEnabled) {
                      const user = yield* userRepo.findById(plant.userId)
                      const timezone = pipe(
                        Option.fromNullable(user),
                        Option.flatMap((u) => Option.fromNullable(u.timezone)),
                        Option.getOrNull
                      )
                      const preferredTime = pipe(
                        Option.fromNullable(user),
                        Option.flatMap((u) =>
                          Option.fromNullable(u.preferredNotificationTime)
                        ),
                        Option.getOrNull
                      )

                      const scheduledAt = yield* calculateScheduledAt(
                        nextWateringAt,
                        timezone,
                        preferredTime
                      )

                      yield* notificationRepo.deletePendingByPlantAndType(
                        plantId,
                        'watering_reminder'
                      )

                      yield* notificationRepo.create({
                        type: 'watering_reminder',
                        title: `Time to water your ${plant.name}`,
                        body: `Your ${plant.name} needs watering today.`,
                        scheduledAt,
                        userId: plant.userId,
                        plantId,
                      })
                    }

                    return {
                      plantId,
                      success: true,
                      plant: updatedPlant ?? undefined,
                    }
                  }),
              })
            }),
          { concurrency: 'unbounded' }
        )

        // 3. Batch insert care logs for successful waterings
        const successfulIds = pipe(
          results,
          Array.filter((r) => r.success),
          Array.map((r) => r.plantId)
        )

        if (successfulIds.length > 0) {
          yield* careLogRepo.createMany(
            Array.map(successfulIds, (plantId) => ({
              type: 'watering' as const,
              plantId,
              date: now,
            }))
          )
        }

        return results
      })
    )
  })
