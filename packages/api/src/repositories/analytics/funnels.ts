import type { AnalyticsRange } from '@lily/api/repositories/analytics.repository'
import { queryOne, queryRows } from '@lily/api/repositories/helpers/raw-query'
import type * as PgDrizzle from '@lily/db/effect-drizzle'
import { CARE_TOPICS } from '@lily/shared'
import { sql } from 'drizzle-orm'
import { Array, Effect, Schema } from 'effect'

const DiagnosisTotalsRow = Schema.Struct({
  total: Schema.Finite,
  resolved: Schema.Finite,
  median_hours: Schema.NullOr(Schema.Finite),
})

const PaywallRow = Schema.Struct({ label: Schema.String, n: Schema.Finite })

const SignupFunnelRow = Schema.Struct({
  cohort_size: Schema.Finite,
  with_plant: Schema.Finite,
  median_hours: Schema.NullOr(Schema.Finite),
})

const TrialFunnelRow = Schema.Struct({
  trials_started: Schema.Finite,
  converted: Schema.Finite,
  median_days: Schema.NullOr(Schema.Finite),
})

const NotificationFunnelRow = Schema.Struct({
  reminders_sent: Schema.Finite,
  acted_within_24h: Schema.Finite,
})

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole)

/** Rates and conversions from one step of the product to the next. */
export const funnelMetrics = (db: PgDrizzle.PgDrizzle['Service']) => {
  // A diagnosis is closed once its latest care plan is completed or dismissed;
  // one still proposed or accepted, or with no plan, stays out of the count.
  const diagnosisResolutionRate = Effect.gen(function* () {
    const row = yield* db
      .execute(sql`
        WITH latest AS (
          SELECT DISTINCT ON (d.id)
            d.created_at, p.status, p.completed_at
          FROM diagnoses d
          INNER JOIN care_plans p ON p.diagnosis_id = d.id
          ORDER BY d.id, p.created_at DESC
        )
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status = 'completed')::int AS resolved,
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600
          ) FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL)
            AS median_hours
        FROM latest
        WHERE status IN ('completed', 'dismissed')
      `)
      .pipe(queryOne(DiagnosisTotalsRow))
    return {
      total: row.total,
      resolved: row.resolved,
      resolutionRate: ratio(row.resolved, row.total),
      medianHoursToResolve: row.median_hours,
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.diagnosisResolutionRate'))

  const paywallAttribution = Effect.gen(function* () {
    const rows = yield* db
      .execute(sql`
        WITH conversions AS (
          SELECT id, user_id, created_at
          FROM subscription_events
          WHERE event_type = 'subscription_created'
            AND metadata IS NOT NULL
            AND metadata::jsonb->>'tier' = 'paid'
        ),
        attributed AS (
          SELECT c.id AS conversion_id, latest.metadata AS attribution_metadata
          FROM conversions c
          LEFT JOIN LATERAL (
            SELECT e.metadata
            FROM subscription_events e
            WHERE e.user_id = c.user_id
              AND e.event_type = 'usage_limit_reached'
              AND e.created_at <= c.created_at
              AND e.created_at >= c.created_at - INTERVAL '72 hours'
            ORDER BY e.created_at DESC
            LIMIT 1
          ) latest ON true
        )
        SELECT
          COALESCE(
            NULLIF(attribution_metadata::jsonb->>'limit', ''),
            'unattributed'
          ) AS label,
          count(*)::int AS n
        FROM attributed
        GROUP BY label
        ORDER BY n DESC
      `)
      .pipe(queryRows(PaywallRow))
    return {
      totalConversions: Array.reduce(rows, 0, (acc, r) => acc + r.n),
      byLimit: Array.map(rows, (r) => ({ label: r.label, count: r.n })),
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.paywallAttribution'))

  const signupToFirstPlant = Effect.gen(function* () {
    const row = yield* db
      .execute(sql`
        WITH cohort AS (
          SELECT id, created_at
          FROM users
          WHERE deleted_at IS NULL
        ),
        first_plant AS (
          SELECT p.user_id, MIN(p.date_added) AS first_at
          FROM plants p
          INNER JOIN cohort c ON c.id = p.user_id
          GROUP BY p.user_id
        )
        SELECT
          (SELECT count(*)::int FROM cohort) AS cohort_size,
          (SELECT count(*)::int FROM first_plant) AS with_plant,
          (
            SELECT percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (fp.first_at - c.created_at)) / 3600
            )
            FROM first_plant fp
            INNER JOIN cohort c ON c.id = fp.user_id
          ) AS median_hours
      `)
      .pipe(queryOne(SignupFunnelRow))
    const cohortSize = row.cohort_size
    return {
      cohortSize,
      steps: [
        {
          label: 'Signed up',
          count: cohortSize,
          pctOfStart: cohortSize === 0 ? 0 : 1,
        },
        {
          label: 'Added first plant',
          count: row.with_plant,
          pctOfStart: Math.round(ratio(row.with_plant, cohortSize) * 100) / 100,
        },
      ],
      medianHoursToFirstPlant: row.median_hours,
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.signupToFirstPlant'))

  const trialToPaid = Effect.gen(function* () {
    const row = yield* db
      .execute(sql`
        WITH trials AS (
          SELECT user_id, MIN(created_at) AS started_at
          FROM subscription_events
          WHERE event_type = 'trial_started'
          GROUP BY user_id
        ),
        conversions AS (
          SELECT e.user_id, MIN(e.created_at) AS converted_at
          FROM subscription_events e
          INNER JOIN trials t ON t.user_id = e.user_id
          WHERE e.event_type = 'subscription_created'
            AND e.metadata IS NOT NULL
            AND e.metadata::jsonb->>'tier' = 'paid'
            AND e.created_at >= t.started_at
            AND e.created_at <= t.started_at + INTERVAL '14 days'
          GROUP BY e.user_id
        )
        SELECT
          (SELECT count(*)::int FROM trials) AS trials_started,
          (SELECT count(*)::int FROM conversions) AS converted,
          (
            SELECT percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (c.converted_at - t.started_at)) / 86400
            )
            FROM conversions c
            INNER JOIN trials t ON t.user_id = c.user_id
          ) AS median_days
      `)
      .pipe(queryOne(TrialFunnelRow))
    return {
      trialsStarted: row.trials_started,
      converted: row.converted,
      conversionRate: ratio(row.converted, row.trials_started),
      medianDaysToConvert: row.median_days,
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.trialToPaid'))

  const notificationToCareAction = Effect.fn(
    'AnalyticsRepository.notificationToCareAction'
  )(function* (range: AnalyticsRange) {
    const row = yield* db
      .execute(sql`
        WITH reminders AS (
          SELECT id, plant_id, sent_at
          FROM notifications
          WHERE type IN (${sql.join(
            Array.map(CARE_TOPICS, (topic) => sql`${topic}`),
            sql`, `
          )})
            AND plant_id IS NOT NULL
            AND status = 'sent'
            AND sent_at IS NOT NULL
            AND sent_at >= ${range.from}
            AND sent_at < ${range.to}
        ),
        acted AS (
          SELECT DISTINCT r.id
          FROM reminders r
          INNER JOIN care_logs cl ON cl.plant_id = r.plant_id
          WHERE cl.date >= r.sent_at
            AND cl.date <= r.sent_at + INTERVAL '24 hours'
        )
        SELECT
          (SELECT count(*)::int FROM reminders) AS reminders_sent,
          (SELECT count(*)::int FROM acted) AS acted_within_24h
      `)
      .pipe(queryOne(NotificationFunnelRow))
    return {
      remindersSent: row.reminders_sent,
      actedOnWithin24h: row.acted_within_24h,
      actionRate: ratio(row.acted_within_24h, row.reminders_sent),
    }
  })

  return {
    diagnosisResolutionRate,
    paywallAttribution,
    signupToFirstPlant,
    trialToPaid,
    notificationToCareAction,
  }
}
