import type { SqlError } from '@effect/sql/SqlError'
import {
  AnalyticsRepository,
  resolveRange,
} from '@lily/api/repositories/analytics.repository'
import type {
  AnalyticsFilters,
  DeadLetterVolumeResponse,
} from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const deadLetterVolume = (
  filters: AnalyticsFilters
): Effect.Effect<DeadLetterVolumeResponse, SqlError, AnalyticsRepository> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    const range = resolveRange(filters.from, filters.to)
    return yield* repo.deadLetterVolume(range)
  }).pipe(Effect.withSpan('AdminAnalyticsService.deadLetterVolume'))
