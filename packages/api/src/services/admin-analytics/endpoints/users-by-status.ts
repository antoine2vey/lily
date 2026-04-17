import type { SqlError } from '@effect/sql/SqlError'
import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import type { UsersByStatusResponse } from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const usersByStatus = (): Effect.Effect<
  UsersByStatusResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    return yield* repo.usersByStatus
  }).pipe(Effect.withSpan('AdminAnalyticsService.usersByStatus'))
