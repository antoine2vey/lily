import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareLog } from '@lily/shared/care-log'
import { CareLogNotFoundError } from '@lily/shared/errors/care-log'
import { Effect } from 'effect'

// Get care log
export const getCareLog = (
  plantId: string,
  logId: string
): Effect.Effect<CareLog, SqlError | CareLogNotFoundError, CareLogRepository> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository
    const log = yield* repo.findById(logId, plantId)

    if (!log) {
      return yield* Effect.fail(new CareLogNotFoundError())
    }

    return log
  })
