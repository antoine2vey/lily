import type { SqlError } from '@effect/sql/SqlError'
import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import type { PlantsPerUserDistributionResponse } from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const plantsPerUserDistribution = (): Effect.Effect<
  PlantsPerUserDistributionResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    return yield* repo.plantsPerUserDistribution
  }).pipe(Effect.withSpan('AdminAnalyticsService.plantsPerUserDistribution'))
