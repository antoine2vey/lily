import type { SqlError } from '@effect/sql/SqlError'
import {
  AnalyticsRepository,
  resolveRange,
} from '@lily/api/repositories/analytics.repository'
import type {
  AiChatVolumeResponse,
  AnalyticsFilters,
} from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const aiChatVolume = (
  filters: AnalyticsFilters
): Effect.Effect<AiChatVolumeResponse, SqlError, AnalyticsRepository> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    const range = resolveRange(filters.from, filters.to)
    return yield* repo.aiChatVolume(range)
  }).pipe(Effect.withSpan('AdminAnalyticsService.aiChatVolume'))
