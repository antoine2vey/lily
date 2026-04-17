import type { SqlError } from '@effect/sql/SqlError'
import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import type { PaidChurnResponse } from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const paidChurn = (): Effect.Effect<
  PaidChurnResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    return yield* repo.getPaidChurn
  }).pipe(Effect.withSpan('AdminAnalyticsService.paidChurn'))
