import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareLog, CareLogUpdateRequest } from '@lily/shared/care-log'
import { CareLogNotFoundError } from '@lily/shared/errors/care-log'
import { Effect } from 'effect'

// Update care log
export const updateCareLog = (
  plantId: string,
  logId: string,
  request: CareLogUpdateRequest
): Effect.Effect<
  CareLog,
  SqlError | CareLogNotFoundError,
  CareLogRepository
> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository

    // Verify the log exists and belongs to this plant
    const existing = yield* repo.findById(logId, plantId)
    if (!existing) {
      return yield* Effect.fail(new CareLogNotFoundError())
    }

    const log = yield* repo.update(logId, {
      notes: request.notes,
      date: request.date,
      photoUrl: request.photoUrl,
    })

    if (!log) {
      return yield* Effect.fail(new CareLogNotFoundError())
    }

    return log
  })
