import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import type { MrrEstimateResponse } from '@lily/shared/admin/analytics'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const mrrEstimate = (): Effect.Effect<
  MrrEstimateResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    return yield* repo.getMrrEstimate
  }).pipe(Effect.withSpan('AdminAnalyticsService.mrrEstimate'))
