import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareLogNotFoundError } from '@lily/shared/errors/care-log'
import { Effect } from 'effect'

// Delete care log
export const deleteCareLog = (
  plantId: string,
  logId: string
): Effect.Effect<
  { message: string },
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

    yield* repo.delete(logId)

    return { message: `Care log ${logId} deleted successfully` }
  }).pipe(
    Effect.withSpan('CareLogsService.deleteCareLog', {
      attributes: { 'plant.id': plantId, 'careLog.id': logId },
    })
  )
