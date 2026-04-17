import type { SqlError } from '@effect/sql/SqlError'
import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import type { SignupToFirstPlantResponse } from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const signupToFirstPlant = (): Effect.Effect<
  SignupToFirstPlantResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    return yield* repo.signupToFirstPlant
  }).pipe(Effect.withSpan('AdminAnalyticsService.signupToFirstPlant'))
