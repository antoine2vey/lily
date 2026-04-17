import type { SqlError } from '@effect/sql/SqlError'
import {
  AnalyticsRepository,
  resolveRange,
} from '@lily/api/repositories/analytics.repository'
import type {
  AnalyticsFilters,
  CareLogVolumeByTypeResponse,
} from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const careLogVolumeByType = (
  filters: AnalyticsFilters
): Effect.Effect<CareLogVolumeByTypeResponse, SqlError, AnalyticsRepository> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    const range = resolveRange(filters.from, filters.to)
    return yield* repo.careLogVolumeByType(range)
  }).pipe(Effect.withSpan('AdminAnalyticsService.careLogVolumeByType'))
