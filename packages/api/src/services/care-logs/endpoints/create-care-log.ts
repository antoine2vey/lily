import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { CareLog, CareLogCreateRequest } from '@lily/shared/care-log'
import { Effect } from 'effect'

export const createCareLog = (
  plantId: string,
  request: CareLogCreateRequest
): Effect.Effect<
  CareLog,
  SqlError,
  | CareLogRepository
  | EventBus
  | CurrentUser
  | PlantRepository
  | NotificationRepository
> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository
    const plantRepo = yield* PlantRepository
    const notificationRepo = yield* NotificationRepository
    const eventBus = yield* EventBus
    const { id: userId } = yield* CurrentUser

    // Get plant to check health status
    const plant = yield* plantRepo.findById(plantId)

    const logOrNull = yield* repo.create({
      type: request.type,
      notes: request.notes,
      date: request.date,
      photoUrl: request.photoUrl,
      plantId,
    })

    if (!logOrNull) {
      return yield* Effect.die(new Error('Failed to create care log'))
    }

    const log = logOrNull

    // Emit CareLogCreated event
    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'CareLogCreated',
        userId,
        plantId,
        careLogId: log.id,
        type: request.type,
      })
    )

    // If plant needed attention, reset health to HEALTHY and emit event
    if (plant?.health === 'NEEDS_ATTENTION') {
      yield* plantRepo.update(plantId, { health: 'HEALTHY' })
      yield* publishWithRetry(
        eventBus.publish({
          _tag: 'AttentionResponded',
          userId,
          plantId,
        })
      )
    }

    // Emit ReminderResponded if there's a notification today
    const hasNotificationToday = yield* notificationRepo.hasNotificationToday(
      userId,
      plantId
    )
    if (hasNotificationToday) {
      yield* publishWithRetry(
        eventBus.publish({
          _tag: 'ReminderResponded',
          userId,
          plantId,
        })
      )
    }

    return log
  })
