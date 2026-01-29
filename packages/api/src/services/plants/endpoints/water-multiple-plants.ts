import * as SqlClient from '@effect/sql/SqlClient'
import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
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

                    // Schedule reminder using shared helper
                    yield* scheduleCareReminder({
                      plantId,
                      plantName: plant.name,
                      userId: plant.userId,
                      type: 'watering_reminder',
                      scheduledDate: nextWateringAt,
                      remindersEnabled: plant.remindersEnabled,
                    })

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
