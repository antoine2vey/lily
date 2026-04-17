import type { SqlError } from '@effect/sql/SqlError'
import {
  AnalyticsRepository,
  resolveRange,
} from '@lily/api/repositories/analytics.repository'
import type {
  AnalyticsFilters,
  NotificationToCareActionResponse,
} from '@lily/shared/admin/analytics'
import { Effect } from 'effect'

export const notificationToCareAction = (
  filters: AnalyticsFilters
): Effect.Effect<
  NotificationToCareActionResponse,
  SqlError,
  AnalyticsRepository
> =>
  Effect.gen(function* () {
    const repo = yield* AnalyticsRepository
    const range = resolveRange(filters.from, filters.to)
    return yield* repo.notificationToCareAction(range)
  }).pipe(Effect.withSpan('AdminAnalyticsService.notificationToCareAction'))
