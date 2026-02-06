import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { RecentActivitiesListResponse } from '@lily/shared/care-log'
import { Effect, Option, pipe } from 'effect'

export const getRecentActivities = (params: {
  limit?: number
}): Effect.Effect<
  RecentActivitiesListResponse,
  SqlError,
  CareLogRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const careLogRepo = yield* CareLogRepository
    const { id: userId } = yield* CurrentUser

    const limit = pipe(
      Option.fromNullable(params.limit),
      Option.getOrElse(() => 10)
    )

    return yield* careLogRepo.findRecentByUserId({
      userId,
      limit,
    })
  }).pipe(Effect.withSpan('CareLogsService.getRecentActivities'))
