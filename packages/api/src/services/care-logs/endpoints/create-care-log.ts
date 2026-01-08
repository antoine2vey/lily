import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareLog, CareLogCreateRequest } from '@lily/shared/care-log'
import { DatabaseError } from '@lily/shared/errors/database'
import { Effect } from 'effect'

// TODO: Get real userId from Auth service when auth is integrated
const TEMP_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

// Create care log
export const createCareLog = (
  plantId: string,
  request: CareLogCreateRequest
): Effect.Effect<
  CareLog,
  SqlError | DatabaseError,
  CareLogRepository | EventBus
> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository
    const eventBus = yield* EventBus
    const userId = TEMP_USER_ID

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
