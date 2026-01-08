import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { Session } from '@lily/api/services/auth/session'
import type { CareLog, CareLogCreateRequest } from '@lily/shared/care-log'
import { DatabaseError } from '@lily/shared/errors/database'
import type { SessionNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

export const createCareLog = (
  plantId: string,
  request: CareLogCreateRequest
): Effect.Effect<
  CareLog,
  SqlError | DatabaseError | SessionNotFoundError,
  | CareLogRepository
  | EventBus
  | Session
  | PlantRepository
  | NotificationRepository
> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository
    const plantRepo = yield* PlantRepository
    const notificationRepo = yield* NotificationRepository
    const eventBus = yield* EventBus
    const { userId } = yield* Session

    // Get plant to check health status
    const plant = yield* plantRepo.findById(plantId)

    const log = yield* repo.create({
      type: request.type,
      notes: request.notes,
      date: request.date,
      photoUrl: request.photoUrl,
      plantId,
    })

    if (!log) {
      return yield* Effect.fail(new DatabaseError())
    }

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

    // Emit AttentionResponded if plant needed attention
    if (plant?.health === 'NEEDS_ATTENTION') {
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
