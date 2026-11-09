import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { ownerKey } from '@lily/api/repositories/helpers/plant-owner'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantRow,
} from '@lily/api/repositories/plant.repository'
import type { RecipientRepository } from '@lily/api/repositories/recipient.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { careContext } from '@lily/api/services/plants/helpers/care-context'
import { publishEventsAfterCommit } from '@lily/api/services/plants/helpers/execute-plant-care'
import { reconcileCareReminder } from '@lily/api/services/plants/helpers/reconcile-reminders'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
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
import {
  Array,
  DateTime,
  Duration,
  Effect,
  Option,
  Order,
  pipe,
  Record,
} from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
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
  | RecipientRepository
  | DelegationRepository
  | CanopyRepository
  | EventBus
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const scheduleRepo = yield* CareScheduleRepository
    const notificationRepo = yield* NotificationRepository

    if (request.plantIds.length === 0) {
      return []
    }

    const foundPlants = yield* repo.findByIds(request.plantIds)
    const who = yield* caller
    const accessible = Array.sort(
      yield* Effect.filter(foundPlants, (plant) =>
        canPerform(who, plant, 'care')
      ),
      Order.mapInput(Order.String, (plant: PlantRow) => plant.id)
    )
    const owners = Record.fromEntries(
      Array.map(accessible, (p) => [ownerKey(p.owner), p.owner] as const)
    )
    const contexts = Record.fromEntries(
      yield* Effect.forEach(Record.toEntries(owners), ([key, owner]) =>
        Effect.map(careContext(owner), (context) => [key, context] as const)
      )
    )
    const nowDt = DateTime.nowUnsafe()
    const now = DateTime.toDateUtc(nowDt)
    const reminderType = `${request.careType}_reminder` as const

    const careFor = (plant: PlantRow) =>
      Effect.gen(function* () {
        const timezone = pipe(
          Record.get(contexts, ownerKey(plant.owner)),
          Option.map((context) => context.timezone),
          Option.getOrElse(() => 'UTC')
        )
        const schedule = yield* scheduleRepo.findByPlantAndType(
          plant.id,
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

        yield* createCareLog(plant, {
          type: request.careType,
          date: now,
        })
        if (schedule && nextCareAt) {
          yield* scheduleRepo.updateByPlantAndType(plant.id, request.careType, {
            lastCareAt: now,
            nextCareAt,
          })
        }
        const updatedPlant = yield* repo.findById(plant.id)
        if (nextCareAt) {
          yield* reconcileCareReminder(plant.id, reminderType)
        }
        return [
          plant.id,
          pipe(Option.fromNullishOr(updatedPlant), Option.getOrUndefined),
        ] as const
      })

    const accessibleIds = Array.map(accessible, (plant) => plant.id)
    const cared = Record.fromEntries(
      yield* withReminderKeys(reminderKeysFor(accessibleIds, [reminderType]))(
        Effect.forEach(accessible, careFor).pipe(
          Effect.tap(() =>
            notificationRepo.deletePendingByPlantsAndType(
              accessibleIds,
              'overdue_reminder'
            )
          )
        )
      ).pipe(publishEventsAfterCommit)
    )

    return Array.map(request.plantIds, (plantId) =>
      pipe(
        Record.get(cared, plantId),
        Option.match({
          onNone: () => ({ plantId, success: false, plant: undefined }),
          onSome: (plant) => ({ plantId, success: true, plant }),
        })
      )
    )
  }).pipe(
    Effect.withSpan('PlantsService.careMultiplePlants', {
      attributes: {
        'plant.count': request.plantIds.length,
        'care.type': request.careType,
      },
    })
  )
