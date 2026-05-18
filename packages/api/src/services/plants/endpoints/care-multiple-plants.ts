import * as SqlClient from '@effect/sql/SqlClient'
import type { SqlError } from '@effect/sql/SqlError'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { canAccessPlant } from '@lily/api/services/plants/helpers/assert-can-access-plant'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { startOfDay } from '@lily/shared'
import type { PlantNotFoundError } from '@lily/shared/errors/plant'
import type {
  CareMultiplePlantsRequest,
  CareMultiplePlantsResponse,
} from '@lily/shared/plant'
import type { EventBus } from '@lily/shared/server'
import { Array, DateTime, Duration, Effect, Option, pipe } from 'effect'

export const careMultiplePlants = (
  request: CareMultiplePlantsRequest
): Effect.Effect<
  CareMultiplePlantsResponse,
  SqlError | PlantNotFoundError,
  | PlantRepository
  | CareScheduleRepository
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
    const scheduleRepo = yield* CareScheduleRepository
    const userRepo = yield* UserRepository
    const { id: currentUserId } = yield* CurrentUser

    if (request.plantIds.length === 0) {
      return []
    }

    const currentUser = yield* userRepo.findById(currentUserId)
    const timezone = pipe(
      Option.fromNullable(currentUser),
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )

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

              const hasAccess = yield* Option.match(plantOption, {
                onNone: () => Effect.succeed(false),
                onSome: (plant) => canAccessPlant(plant.userId, plant.id),
              })

              if (!hasAccess) {
                return {
                  plantId,
                  success: false,
                  plant: undefined,
                }
              }

              // Safe: hasAccess is false when plantOption is None (onNone branch)
              const plant = Option.getOrThrow(plantOption)

              // Get frequency from schedule
              const schedule = yield* scheduleRepo.findByPlantAndType(
                plantId,
                request.careType
              )
              const frequency = pipe(
                Option.fromNullable(schedule),
                Option.map((s) => s.frequencyDays),
                Option.getOrUndefined
              )

              const nowDayStart = startOfDay(nowDt, timezone)
              const nextCareAt = frequency
                ? DateTime.toDateUtc(
                    DateTime.addDuration(nowDayStart, Duration.days(frequency))
                  )
                : undefined

              // Create care log + publish events
              yield* createCareLog(plantId, {
                type: request.careType,
                date: now,
              })

              // Update schedule table
              if (schedule && nextCareAt) {
                yield* scheduleRepo.updateByPlantAndType(
                  plantId,
                  request.careType,
                  {
                    lastCareAt: now,
                    nextCareAt,
                  }
                )
              }

              // Re-fetch to include room data
              const updatedPlant = yield* repo.findById(plantId)

              // Schedule reminder
              if (nextCareAt) {
                yield* scheduleCareReminder({
                  plantId,
                  userId: plant.userId,
                  type: `${request.careType}_reminder` as const,
                  scheduledDate: nextCareAt,
                  remindersEnabled: plant.remindersEnabled,
                })
              }

              return {
                plantId,
                success: true,
                plant: pipe(
                  Option.fromNullable(updatedPlant),
                  Option.getOrUndefined
                ),
              }
            }),
          { concurrency: 10 }
        )

        return results
      })
    )
  }).pipe(
    Effect.withSpan('PlantsService.careMultiplePlants', {
      attributes: {
        'plant.count': request.plantIds.length,
        'care.type': request.careType,
      },
    })
  )
