import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareLog, CareLogCreateRequest } from '@lily/shared/care-log'
import { DatabaseError } from '@lily/shared/errors/database'
import { Effect } from 'effect'

// Create care log
export const createCareLog = (
  plantId: string,
  request: CareLogCreateRequest
): Effect.Effect<CareLog, SqlError | DatabaseError, CareLogRepository> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository
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

    return log
  })
