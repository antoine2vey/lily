import { queryOne, queryRows } from '@lily/api/repositories/helpers/raw-query'
import type * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  type AnalyticsMetricKey,
  ChurnSnapshotValue,
  DauSnapshotValue,
  MrrSnapshotValue,
} from '@lily/shared/admin/analytics'
import { sql } from 'drizzle-orm'
import { Array, Effect, Option, pipe, Schema } from 'effect'

/** The shape of the jsonb `value` that `analytics_daily_snapshots` stores per metric. */
const SNAPSHOTS = {
  mrr_estimate: MrrSnapshotValue,
  dau_wau_mau: DauSnapshotValue,
  paid_churn_monthly: ChurnSnapshotValue,
} as const satisfies Record<AnalyticsMetricKey, Schema.Top>

export type SnapshotValue<K extends AnalyticsMetricKey> =
  (typeof SNAPSHOTS)[K]['Type']

const ChurnCountsRow = Schema.Struct({
  canceled: Schema.Finite,
  active_start: Schema.Finite,
})

const NO_ACTIVITY: DauSnapshotValue = { dau: 0, wau: 0, mau: 0 }

/**
 * The metrics the analytics scheduler computes and stores once a day, and
 * the trends the admin reads back. A stored value that does not match its
 * metric's schema is a defect, so a bad row fails its card instead of
 * showing as zero.
 */
export const snapshotMetrics = (db: PgDrizzle.PgDrizzle['Service']) => {
  const writeSnapshot = <K extends AnalyticsMetricKey>(
    date: string,
    metricKey: K,
    value: SnapshotValue<K>
  ) =>
    Effect.gen(function* () {
      const json = yield* Schema.encodeUnknownEffect(
        Schema.fromJsonString(SNAPSHOTS[metricKey])
      )(value).pipe(Effect.orDie)
      yield* db.execute(sql`
        INSERT INTO analytics_daily_snapshots (date, metric_key, value, created_at, updated_at)
        VALUES (${date}, ${metricKey}, ${json}::jsonb, NOW(), NOW())
        ON CONFLICT (date, metric_key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `)
    }).pipe(
      Effect.withSpan('AnalyticsRepository.writeSnapshot', {
        attributes: { 'metric.key': metricKey, 'metric.date': date },
      })
    )

  const readSnapshots = <K extends AnalyticsMetricKey>(
    metricKey: K,
    days: number
  ) =>
    // The ::int cast makes `DATE - INTEGER` (day subtraction) unambiguous.
    db
      .execute(sql`
        SELECT to_char(date, 'YYYY-MM-DD') AS date, value
        FROM analytics_daily_snapshots
        WHERE metric_key = ${metricKey}
          AND date >= CURRENT_DATE - (${days})::int
        ORDER BY date ASC
      `)
      .pipe(
        queryRows(
          Schema.Struct({ date: Schema.String, value: SNAPSHOTS[metricKey] })
        )
      )

  const computeMrrSnapshot = Effect.suspend(() =>
    db.execute(sql`
      SELECT COALESCE(SUM(st.price_monthly), 0)::int AS cents
      FROM user_subscriptions s
      INNER JOIN subscription_tiers st ON st.tier = s.tier
      WHERE s.status = 'active'
        AND s.tier = 'paid'
    `)
  ).pipe(
    queryOne(MrrSnapshotValue),
    Effect.withSpan('AnalyticsRepository.computeMrrSnapshot')
  )

  // One pass over activity with FILTER aggregates, pruned to 30d at source
  // so the UNION ALL never materializes older rows.
  const computeDauWauMauSnapshot = Effect.suspend(() =>
    db.execute(sql`
      SELECT
        count(DISTINCT user_id) FILTER (WHERE ts >= NOW() - INTERVAL '1 day')::int  AS dau,
        count(DISTINCT user_id) FILTER (WHERE ts >= NOW() - INTERVAL '7 days')::int AS wau,
        count(DISTINCT user_id)::int AS mau
      FROM (
        SELECT user_id, created_at AS ts FROM chat_messages
          WHERE created_at >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT p.user_id, cl.date AS ts
          FROM care_logs cl INNER JOIN plants p ON p.id = cl.plant_id
          WHERE cl.date >= NOW() - INTERVAL '30 days'
        UNION ALL
        SELECT user_id, created_at AS ts FROM plant_scans
          WHERE created_at >= NOW() - INTERVAL '30 days'
      ) activity
    `)
  ).pipe(
    queryOne(DauSnapshotValue),
    Effect.withSpan('AnalyticsRepository.computeDauWauMauSnapshot')
  )

  // Monthly churn for the previous calendar month. The current one isn't
  // over, so running totals would monotonically grow and mislead.
  const computePaidChurnSnapshot = Effect.gen(function* () {
    const row = yield* db
      .execute(sql`
        WITH bounds AS (
          SELECT
            date_trunc('month', NOW() - INTERVAL '1 month') AS m_start,
            date_trunc('month', NOW()) AS m_end
        ),
        active_start AS (
          SELECT count(*)::int AS n
          FROM user_subscriptions s, bounds b
          WHERE s.tier = 'paid'
            AND s.current_period_start < b.m_start
            AND (s.canceled_at IS NULL OR s.canceled_at >= b.m_start)
        ),
        canceled AS (
          SELECT count(*)::int AS n
          FROM subscription_events e, bounds b
          WHERE e.event_type = 'subscription_canceled'
            AND e.created_at >= b.m_start
            AND e.created_at < b.m_end
        )
        SELECT
          (SELECT n FROM canceled) AS canceled,
          (SELECT n FROM active_start) AS active_start
      `)
      .pipe(queryOne(ChurnCountsRow))
    return {
      rate: row.active_start === 0 ? 0 : row.canceled / row.active_start,
      canceled: row.canceled,
      activeStart: row.active_start,
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.computePaidChurnSnapshot'))

  const getMrrEstimate = Effect.gen(function* () {
    const rows = yield* readSnapshots('mrr_estimate', 30)
    const trend = Array.map(rows, (r) => ({
      date: r.date,
      value: r.value.cents,
    }))
    return {
      currentCents: pipe(
        Array.last(trend),
        Option.match({ onNone: () => 0, onSome: (p) => p.value })
      ),
      trend,
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.getMrrEstimate'))

  const getDauWauMau = Effect.gen(function* () {
    const rows = yield* readSnapshots('dau_wau_mau', 30)
    const latest = pipe(
      Array.last(rows),
      Option.match({ onNone: () => NO_ACTIVITY, onSome: (r) => r.value })
    )
    return {
      dau: latest.dau,
      wau: latest.wau,
      mau: latest.mau,
      stickiness: latest.mau === 0 ? 0 : latest.dau / latest.mau,
      trend: Array.map(rows, (r) => ({ date: r.date, value: r.value.dau })),
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.getDauWauMau'))

  const getPaidChurn = Effect.gen(function* () {
    const rows = yield* readSnapshots('paid_churn_monthly', 365)
    const trend = Array.map(rows, (r) => ({
      date: r.date,
      value: r.value.rate,
    }))
    return {
      currentRate: pipe(
        Array.last(trend),
        Option.match({ onNone: () => 0, onSome: (p) => p.value })
      ),
      trend,
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.getPaidChurn'))

  return {
    writeSnapshot,
    computeMrrSnapshot,
    computeDauWauMauSnapshot,
    computePaidChurnSnapshot,
    getMrrEstimate,
    getDauWauMau,
    getPaidChurn,
  }
}
