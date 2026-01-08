import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import {
  CareLogRepository,
  type FindCareLogsParams,
} from '@lily/api/repositories/care-log.repository'
import { Session } from '@lily/api/services/auth/session'
import type { CareLogsListResponse } from '@lily/shared/care-log'
import type { SessionNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

// Get care logs
export const getCareLogs = (
  params: FindCareLogsParams
): Effect.Effect<
  CareLogsListResponse,
  SqlError | SessionNotFoundError,
  CareLogRepository | EventBus | Session
> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository
    const eventBus = yield* EventBus
    const { userId } = yield* Session

    const result = yield* repo.findByPlantId(params)

    // Emit CareHistoryViewed on first page to track for HISTORY_HERO achievement
    if ((params.page ?? 1) === 1) {
      yield* publishWithRetry(
        eventBus.publish({
          _tag: 'CareHistoryViewed',
          userId,
        })
      )
    }

    return result
  })
