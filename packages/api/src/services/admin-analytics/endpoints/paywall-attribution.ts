import type { SqlError } from '@effect/sql/SqlError'
import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import type { PaywallAttributionResponse } from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const paywallAttribution = (): Effect.Effect<
  PaywallAttributionResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    return yield* repo.paywallAttribution
  }).pipe(Effect.withSpan('AdminAnalyticsService.paywallAttribution'))
