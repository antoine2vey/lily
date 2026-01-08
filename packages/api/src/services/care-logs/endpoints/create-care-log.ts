import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
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
  CareLogRepository | EventBus | Session
> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository
    const eventBus = yield* EventBus
    const { userId } = yield* Session

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

    yield* publishWithRetry(
      eventBus.publish({
        _tag: 'CareLogCreated',
        userId,
        plantId,
        careLogId: log.id,
        type: request.type,
      })
    )

    return log
  })
