import * as SqlClient from '@effect/sql/SqlClient'
import type { SqlError } from '@effect/sql/SqlError'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { canAccessPlant } from '@lily/api/services/plants/helpers/assert-can-access-plant'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import type { PlantNotFoundError } from '@lily/shared/errors/plant'
import type {
  WaterMultiplePlantsRequest,
  WaterMultiplePlantsResponse,
} from '@lily/shared/plant'
import type { EventBus } from '@lily/shared/server'
import { Array, DateTime, Duration, Effect, Option } from 'effect'

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
  | CurrentUser
  | DelegationRepository
  | EventBus
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const repo = yield* PlantRepository

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

              // Treat "not found" and "not authorized" identically
              // to avoid leaking plant existence information
              const hasAccess = yield* Option.match(plantOption, {
                onNone: () => Effect.succeed(false),
                onSome: (plant) => canAccessPlant(plant.userId, plant.id),
              })

              if (!hasAccess || Option.isNone(plantOption)) {
                return {
                  plantId,
                  success: false,
                  plant: undefined,
                }
              }

              const plant = plantOption.value

              const nowDayStart = DateTime.startOf(nowDt, 'day')
              const nextWateringDt = DateTime.addDuration(
                nowDayStart,
                Duration.days(plant.wateringFrequencyDays)
              )
              const nextWateringAt = DateTime.toDateUtc(nextWateringDt)

              // Create care log + publish events (CareLogCreated, AttentionResponded, ReminderResponded)
              // Called before plant update so createCareLog sees the original health state
              yield* createCareLog(plantId, {
                type: 'watering',
                date: now,
              })

              yield* repo.update(plantId, {
                lastWateredAt: now,
                nextWateringAt,
              })

              // Re-fetch to include room data
              const updatedPlant = yield* repo.findById(plantId)

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
          { concurrency: 'unbounded' }
        )

        return results
      })
    )
  }).pipe(
    Effect.withSpan('PlantsService.waterMultiplePlants', {
      attributes: { 'plant.count': request.plantIds.length },
    })
  )
