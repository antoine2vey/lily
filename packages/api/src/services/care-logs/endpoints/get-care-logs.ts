import type { SqlError } from '@effect/sql/SqlError'
import { EventBus, publishWithRetry } from '@lily/api/events'
import {
  CareLogRepository,
  type FindCareLogsParams,
} from '@lily/api/repositories/care-log.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { CareLogsListResponse } from '@lily/shared/care-log'
import { Effect, Option, pipe } from 'effect'

// Get care logs
export const getCareLogs = (
  params: FindCareLogsParams
): Effect.Effect<
  CareLogsListResponse,
  SqlError,
  CareLogRepository | EventBus | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* CareLogRepository
    const eventBus = yield* EventBus
    const { id: userId } = yield* CurrentUser

    const result = yield* repo.findByPlantId(params)

    // Emit CareHistoryViewed on first page to track for HISTORY_HERO achievement
    const currentPage = pipe(
      Option.fromNullable(params.page),
      Option.getOrElse(() => 1)
    )
    if (currentPage === 1) {
      yield* publishWithRetry(
        eventBus.publish({
          _tag: 'CareHistoryViewed',
          userId,
        })
      )
    }

    return result
  }).pipe(
    Effect.withSpan('CareLogsService.getCareLogs', {
      attributes: { 'plant.id': params.plantId },
    })
  )
