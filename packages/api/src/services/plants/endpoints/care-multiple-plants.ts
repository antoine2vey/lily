import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { ownerKey } from '@lily/api/repositories/helpers/plant-owner'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { careContext } from '@lily/api/services/plants/helpers/care-context'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import {
  caller,
  canPerform,
} from '@lily/api/services/plants/helpers/with-plant-access'
import { startOfDay } from '@lily/shared'
import type { PlantNotFoundError } from '@lily/shared/errors/plant'
import type {
  CareMultiplePlantsRequest,
  CareMultiplePlantsResponse,
} from '@lily/shared/plant'
import type { EventBus } from '@lily/shared/server'
import { Array, DateTime, Duration, Effect, Option, pipe, Record } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

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
  | CanopyRepository
  | EventBus
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const repo = yield* PlantRepository
    const scheduleRepo = yield* CareScheduleRepository

    if (request.plantIds.length === 0) {
      return []
    }

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        // 1. Batch fetch all plants
        const foundPlants = yield* repo.findByIds(request.plantIds)

        const nowDt = DateTime.nowUnsafe()
        const now = DateTime.toDateUtc(nowDt)
        const who = yield* caller
        const notificationRepo = yield* NotificationRepository
        const owners = Record.fromEntries(
          Array.map(foundPlants, (p) => [ownerKey(p.owner), p.owner] as const)
        )
        const contexts = Record.fromEntries(
          yield* Effect.forEach(Record.toEntries(owners), ([key, owner]) =>
            Effect.map(careContext(owner), (context) => [key, context] as const)
          )
        )

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
                onSome: (plant) => canPerform(who, plant, 'care'),
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
              const timezone = pipe(
                Record.get(contexts, ownerKey(plant.owner)),
                Option.map((context) => context.timezone),
                Option.getOrElse(() => 'UTC')
              )

              // Get frequency from schedule
              const schedule = yield* scheduleRepo.findByPlantAndType(
                plantId,
                request.careType
              )
              const frequency = pipe(
                Option.fromNullishOr(schedule),
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
              yield* createCareLog(plant, {
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
                  plant,
                  type: `${request.careType}_reminder` as const,
                  scheduledDate: nextCareAt,
                })
              }
              yield* notificationRepo.deletePendingByPlantAndType(
                plantId,
                'overdue_reminder'
              )

              return {
                plantId,
                success: true,
                plant: pipe(
                  Option.fromNullishOr(updatedPlant),
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
