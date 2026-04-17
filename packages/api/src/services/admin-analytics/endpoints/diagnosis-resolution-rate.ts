import type { SqlError } from '@effect/sql/SqlError'
import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import type { DiagnosisResolutionRateResponse } from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const diagnosisResolutionRate = (): Effect.Effect<
  DiagnosisResolutionRateResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    return yield* repo.diagnosisResolutionRate
  }).pipe(Effect.withSpan('AdminAnalyticsService.diagnosisResolutionRate'))
