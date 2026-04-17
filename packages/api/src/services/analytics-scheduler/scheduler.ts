import { AnalyticsRepository } from '@lily/api/repositories/analytics.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { ANALYTICS_METRIC_KEYS } from '@lily/shared/admin/analytics'
import { DateTime, Effect } from 'effect'

/**
 * Computes precomputed analytics metrics (MRR, DAU/WAU/MAU, monthly paid
 * churn) and upserts one row per metric per UTC day into
 * `analytics_daily_snapshots`.
 *
 * Runs every 6 hours on startup. The admin dashboard reads the latest row
 * of each metric + the time-series trend from this table, so this scheduler
 * is what actually makes those three KPIs appear.
 */
export const writeAnalyticsSnapshots = Effect.gen(function* () {
  const repo = yield* AnalyticsRepository

  const todayUtc = DateTime.formatIsoDate(DateTime.unsafeNow())

  yield* Effect.log('Writing analytics snapshots', { date: todayUtc })

  const [mrr, dauWauMau, churn] = yield* Effect.all(
    [
      repo.computeMrrSnapshot,
      repo.computeDauWauMauSnapshot,
      repo.computePaidChurnSnapshot,
    ],
    { concurrency: 3 }
  )

  yield* Effect.all(
    [
      repo.writeSnapshot(todayUtc, ANALYTICS_METRIC_KEYS.mrrEstimate, mrr),
      repo.writeSnapshot(todayUtc, ANALYTICS_METRIC_KEYS.dauWauMau, dauWauMau),
      repo.writeSnapshot(
        todayUtc,
        ANALYTICS_METRIC_KEYS.paidChurnMonthly,
        churn
      ),
    ],
    { concurrency: 3 }
  )

  yield* Effect.log('Analytics snapshots written', {
    date: todayUtc,
    mrrCents: mrr.cents,
    dau: dauWauMau.dau,
    wau: dauWauMau.wau,
    mau: dauWauMau.mau,
    churnRate: churn.rate,
  })
}).pipe(Effect.withSpan('analytics-scheduler.writeSnapshots'))

export const startAnalyticsScheduler = createScheduler({
  name: 'analytics-scheduler',
  interval: '6 hours',
  runOnStartup: true,
  task: writeAnalyticsSnapshots,
})
