import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import type { DauWauMauResponse } from '@lily/shared/admin/analytics'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const dauWauMau = (): Effect.Effect<
  DauWauMauResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    return yield* repo.getDauWauMau
  }).pipe(Effect.withSpan('AdminAnalyticsService.dauWauMau'))
