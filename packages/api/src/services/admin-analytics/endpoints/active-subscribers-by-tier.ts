import type { SqlError } from '@effect/sql/SqlError'
import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import type { ActiveSubscribersByTierResponse } from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const activeSubscribersByTier = (): Effect.Effect<
  ActiveSubscribersByTierResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    return yield* repo.activeSubscribersByTier
  }).pipe(Effect.withSpan('AdminAnalyticsService.activeSubscribersByTier'))
