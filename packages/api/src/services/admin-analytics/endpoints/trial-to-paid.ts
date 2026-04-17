import type { SqlError } from '@effect/sql/SqlError'
import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import type { TrialToPaidResponse } from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const trialToPaid = (): Effect.Effect<
  TrialToPaidResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    return yield* repo.trialToPaid
  }).pipe(Effect.withSpan('AdminAnalyticsService.trialToPaid'))
