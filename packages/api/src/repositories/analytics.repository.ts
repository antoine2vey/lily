import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { unwrapPgRows } from '@lily/api/repositories/helpers/pagination'
import type {
  SubscriptionStatus,
  SubscriptionTier,
  UserStatus,
} from '@lily/shared'
import { parseApiDate } from '@lily/shared'
import type {
  ActiveSubscribersByTierResponse,
  AiChatVolumeResponse,
  AnalyticsMetricKey,
  CareLogVolumeByTypeResponse,
  DauWauMauResponse,
  DeadLetterVolumeResponse,
  DiagnosisResolutionRateResponse,
  MrrEstimateResponse,
  NotificationToCareActionResponse,
  PaidChurnResponse,
  PaywallAttributionResponse,
  PlantsPerUserDistributionResponse,
  SignupToFirstPlantResponse,
  TrialToPaidResponse,
  UsersByStatusResponse,
} from '@lily/shared/admin/analytics'
import {
  ChurnSnapshotValue,
  DauSnapshotValue,
  MrrSnapshotValue,
} from '@lily/shared/admin/analytics'
import { sql } from 'drizzle-orm'
import {
  Array,
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Order,
  pipe,
  Record,
  Schema,
} from 'effect'

export interface AnalyticsRange {
  readonly from: Date
  readonly to: Date
}

export const resolveRange = (
  from: string | undefined,
  to: string | undefined
): AnalyticsRange => {
  const current = DateTime.unsafeNow()
  const defaultFrom = DateTime.subtract(current, { days: 30 })
  return {
    from: DateTime.toDate(
      pipe(
        parseApiDate(from),
        Option.getOrElse(() => defaultFrom)
      )
    ),
    to: DateTime.toDate(
      pipe(
        parseApiDate(to),
        Option.getOrElse(() => current)
      )
    ),
  }
}

export interface IAnalyticsRepository {
  readonly usersByStatus: Effect.Effect<UsersByStatusResponse, SqlError>
  readonly activeSubscribersByTier: Effect.Effect<
    ActiveSubscribersByTierResponse,
    SqlError
  >
  readonly plantsPerUserDistribution: Effect.Effect<
    PlantsPerUserDistributionResponse,
    SqlError
  >
  readonly careLogVolumeByType: (
    range: AnalyticsRange
  ) => Effect.Effect<CareLogVolumeByTypeResponse, SqlError>
  readonly deadLetterVolume: (
    range: AnalyticsRange
  ) => Effect.Effect<DeadLetterVolumeResponse, SqlError>
  readonly aiChatVolume: (
    range: AnalyticsRange
  ) => Effect.Effect<AiChatVolumeResponse, SqlError>
  readonly diagnosisResolutionRate: Effect.Effect<
    DiagnosisResolutionRateResponse,
    SqlError
  >
  readonly paywallAttribution: Effect.Effect<
    PaywallAttributionResponse,
    SqlError
  >
  readonly signupToFirstPlant: Effect.Effect<
    SignupToFirstPlantResponse,
    SqlError
  >
  readonly trialToPaid: Effect.Effect<TrialToPaidResponse, SqlError>
  readonly notificationToCareAction: (
    range: AnalyticsRange
  ) => Effect.Effect<NotificationToCareActionResponse, SqlError>
  readonly writeSnapshot: (
    date: string,
    metricKey: AnalyticsMetricKey,
    value: unknown
  ) => Effect.Effect<void, SqlError>
  readonly computeMrrSnapshot: Effect.Effect<MrrSnapshotValue, SqlError>
  readonly computeDauWauMauSnapshot: Effect.Effect<DauSnapshotValue, SqlError>
  readonly computePaidChurnSnapshot: Effect.Effect<ChurnSnapshotValue, SqlError>
  readonly getMrrEstimate: Effect.Effect<MrrEstimateResponse, SqlError>
  readonly getDauWauMau: Effect.Effect<DauWauMauResponse, SqlError>
  readonly getPaidChurn: Effect.Effect<PaidChurnResponse, SqlError>
}

export class AnalyticsRepository extends Context.Tag('AnalyticsRepository')<
  AnalyticsRepository,
  IAnalyticsRepository
>() {}

// ============================================================================
// Row types for raw query results
// ============================================================================

type UsersByStatusRow = { status: UserStatus; n: number }

type SubsByTierRow = {
  tier: SubscriptionTier
  status: SubscriptionStatus
  n: number
}

type PlantsPerUserRow = { bucket: string; users_count: number }

type PlantsPerUserTotalsRow = { users: number; plants: number }

type CareLogVolumeRow = { type: string; day: string; n: number }

type DeadLetterSeriesRow = { topic: string; day: string; n: number }

type DeadLetterTopErrorRow = { topic: string; error: string; n: number }

type AiChatDailyRow = { day: string; messages: number; users: number }

type AiChatUniqueRow = { total_unique: number }

type DiagnosisTotalsRow = {
  total: number
  resolved: number
  median_hours: number | null
}

type PaywallRow = { label: string; n: number }

type SignupFunnelRow = {
  cohort_size: number
  with_plant: number
  median_hours: number | null
}

type TrialFunnelRow = {
  trials_started: number
  converted: number
  median_days: number | null
}

type NotificationFunnelRow = {
  reminders_sent: number
  acted_within_24h: number
}

type ChurnComputeRow = { canceled: number; active_start: number }

type SnapshotReadRow = { date: string; value: unknown }

const CARE_REMINDER_TYPES = [
  'watering_reminder',
  'fertilization_reminder',
  'misting_reminder',
  'repotting_reminder',
  'overdue_reminder',
] as const

const PLANT_BUCKETS = ['0', '1', '2-5', '6-10', '11-25', '25+'] as const

const byString = <T>(pick: (x: T) => string): Order.Order<T> =>
  Order.mapInput(Order.string, pick)

const groupPoints = <R>(
  rows: ReadonlyArray<R>,
  keyOf: (r: R) => string,
  dayOf: (r: R) => string,
  valueOf: (r: R) => number
): Record<string, Array<{ date: string; value: number }>> =>
  pipe(
    Array.groupBy(rows, keyOf),
    Record.map((rs) =>
      Array.map(rs, (r) => ({ date: dayOf(r), value: valueOf(r) }))
    )
  )

const decodeMrr = Schema.decodeUnknownOption(MrrSnapshotValue)
const decodeDau = Schema.decodeUnknownOption(DauSnapshotValue)
const decodeChurn = Schema.decodeUnknownOption(ChurnSnapshotValue)

export const AnalyticsRepositoryLive = Layer.effect(
  AnalyticsRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const usersByStatus = Effect.gen(function* () {
      const result = yield* db.execute(sql`
        SELECT status, count(*)::int AS n
        FROM users
        WHERE deleted_at IS NULL
        GROUP BY status
      `)
      const rows = unwrapPgRows<UsersByStatusRow>(result)
      const total = pipe(
        rows,
        Array.reduce(0, (acc, r) => acc + r.n)
      )
      return {
        total,
        byStatus: Array.map(rows, (r) => ({
          status: r.status,
          count: r.n,
        })),
      }
    }).pipe(Effect.withSpan('AnalyticsRepository.usersByStatus'))

    const activeSubscribersByTier = Effect.gen(function* () {
      const result = yield* db.execute(sql`
        SELECT tier, status, count(*)::int AS n
        FROM user_subscriptions
        WHERE status IN ('active', 'trialing')
        GROUP BY tier, status
        ORDER BY tier ASC, status ASC
      `)
      const rows = unwrapPgRows<SubsByTierRow>(result)
      const total = pipe(
        rows,
        Array.reduce(0, (acc, r) => acc + r.n)
      )
      return {
        total,
        byTier: Array.map(rows, (r) => ({
          tier: r.tier,
          status: r.status,
          count: r.n,
        })),
      }
    }).pipe(Effect.withSpan('AnalyticsRepository.activeSubscribersByTier'))

    const plantsPerUserDistribution = Effect.gen(function* () {
      const [distributionResult, totalsResult] = yield* Effect.all(
        [
          db.execute(sql`
            WITH per_user AS (
              SELECT u.id, count(p.id)::int AS n
              FROM users u
              LEFT JOIN plants p ON p.user_id = u.id
              WHERE u.deleted_at IS NULL
              GROUP BY u.id
            )
            SELECT bucket, count(*)::int AS users_count
            FROM (
              SELECT
                CASE
                  WHEN n = 0 THEN '0'
                  WHEN n = 1 THEN '1'
                  WHEN n BETWEEN 2 AND 5 THEN '2-5'
                  WHEN n BETWEEN 6 AND 10 THEN '6-10'
                  WHEN n BETWEEN 11 AND 25 THEN '11-25'
                  ELSE '25+'
                END AS bucket
              FROM per_user
            ) bucketed
            GROUP BY bucket
          `),
          db.execute(sql`
            SELECT
              (SELECT count(*)::int FROM users WHERE deleted_at IS NULL) AS users,
              (SELECT count(*)::int
                 FROM plants p
                 INNER JOIN users u ON u.id = p.user_id
                 WHERE u.deleted_at IS NULL) AS plants
          `),
        ],
        { concurrency: 2 }
      )

      const distribution = unwrapPgRows<PlantsPerUserRow>(distributionResult)
      const totals = unwrapPgRows<PlantsPerUserTotalsRow>(totalsResult)

      const countsByBucket = new Map<string, number>(
        Array.map(distribution, (r) => [r.bucket, r.users_count])
      )
      const buckets = Array.map(PLANT_BUCKETS, (label) => ({
        label,
        count: countsByBucket.get(label) ?? 0,
      }))

      const firstRow = Array.head(totals)
      return {
        totalUsers: pipe(
          firstRow,
          Option.map((r) => r.users),
          Option.getOrElse(() => 0)
        ),
        totalPlants: pipe(
          firstRow,
          Option.map((r) => r.plants),
          Option.getOrElse(() => 0)
        ),
        buckets,
      }
    }).pipe(Effect.withSpan('AnalyticsRepository.plantsPerUserDistribution'))

    const careLogVolumeByType = Effect.fn(
      'AnalyticsRepository.careLogVolumeByType'
    )(function* (range: AnalyticsRange) {
      const result = yield* db.execute(sql`
          SELECT
            type,
            to_char(date_trunc('day', date AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
            count(*)::int AS n
          FROM care_logs
          WHERE date >= ${range.from} AND date < ${range.to}
          GROUP BY type, day
          ORDER BY day ASC, type ASC
        `)
      const rows = unwrapPgRows<CareLogVolumeRow>(result)
      const grouped = groupPoints(
        rows,
        (r) => r.type,
        (r) => r.day,
        (r) => r.n
      )
      const series = pipe(
        Record.toEntries(grouped),
        Array.map(([type, points]) => ({ type, points })),
        Array.sort(byString<{ type: string }>((x) => x.type))
      )
      const totalInRange = pipe(
        rows,
        Array.reduce(0, (acc, r) => acc + r.n)
      )
      return { totalInRange, series }
    })

    const deadLetterVolume = Effect.fn('AnalyticsRepository.deadLetterVolume')(
      function* (range: AnalyticsRange) {
        const [seriesResult, topErrorsResult] = yield* Effect.all(
          [
            db.execute(sql`
              SELECT
                topic,
                to_char(date_trunc('day', failed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
                count(*)::int AS n
              FROM dead_letter_messages
              WHERE failed_at >= ${range.from} AND failed_at < ${range.to}
              GROUP BY topic, day
              ORDER BY day ASC, topic ASC
            `),
            db.execute(sql`
              SELECT topic, error, count(*)::int AS n
              FROM dead_letter_messages
              WHERE failed_at >= ${range.from} AND failed_at < ${range.to}
              GROUP BY topic, error
              ORDER BY n DESC
              LIMIT 5
            `),
          ],
          { concurrency: 2 }
        )

        const seriesRows = unwrapPgRows<DeadLetterSeriesRow>(seriesResult)
        const topErrorRows =
          unwrapPgRows<DeadLetterTopErrorRow>(topErrorsResult)

        const grouped = groupPoints(
          seriesRows,
          (r) => r.topic,
          (r) => r.day,
          (r) => r.n
        )
        const series = pipe(
          Record.toEntries(grouped),
          Array.map(([topic, points]) => ({ topic, points })),
          Array.sort(byString<{ topic: string }>((x) => x.topic))
        )
        const totalInRange = pipe(
          seriesRows,
          Array.reduce(0, (acc, r) => acc + r.n)
        )
        const topErrors = Array.map(topErrorRows, (r) => ({
          topic: r.topic,
          error: r.error,
          count: r.n,
        }))
        return { totalInRange, series, topErrors }
      }
    )

    const aiChatVolume = Effect.fn('AnalyticsRepository.aiChatVolume')(
      function* (range: AnalyticsRange) {
        const [dailyResult, uniqueResult] = yield* Effect.all(
          [
            db.execute(sql`
              SELECT
                to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
                count(*)::int AS messages,
                count(DISTINCT user_id)::int AS users
              FROM chat_messages
              WHERE created_at >= ${range.from} AND created_at < ${range.to}
              GROUP BY day
              ORDER BY day ASC
            `),
            db.execute(sql`
              SELECT count(DISTINCT user_id)::int AS total_unique
              FROM chat_messages
              WHERE created_at >= ${range.from} AND created_at < ${range.to}
            `),
          ],
          { concurrency: 2 }
        )

        const dailyRows = unwrapPgRows<AiChatDailyRow>(dailyResult)
        const uniqueRows = unwrapPgRows<AiChatUniqueRow>(uniqueResult)

        const totalMessages = pipe(
          dailyRows,
          Array.reduce(0, (acc, r) => acc + r.messages)
        )
        const uniqueUsers = pipe(
          Array.head(uniqueRows),
          Option.map((r) => r.total_unique),
          Option.getOrElse(() => 0)
        )

        return {
          totalMessages,
          uniqueUsers,
          trend: Array.map(dailyRows, (r) => ({
            date: r.day,
            messages: r.messages,
            users: r.users,
          })),
        }
      }
    )

    const diagnosisResolutionRate = Effect.gen(function* () {
      const result = yield* db.execute(sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600
          ) FILTER (WHERE status = 'RESOLVED' AND resolved_at IS NOT NULL)
            AS median_hours
        FROM diagnoses
      `)
      const rows = unwrapPgRows<DiagnosisTotalsRow>(result)
      const row = pipe(
        Array.head(rows),
        Option.getOrElse(
          (): DiagnosisTotalsRow => ({
            total: 0,
            resolved: 0,
            median_hours: null,
          })
        )
      )
      const resolutionRate = row.total === 0 ? 0 : row.resolved / row.total
      return {
        total: row.total,
        resolved: row.resolved,
        resolutionRate,
        medianHoursToResolve: row.median_hours,
      }
    }).pipe(Effect.withSpan('AnalyticsRepository.diagnosisResolutionRate'))

    const paywallAttribution = Effect.gen(function* () {
      const result = yield* db.execute(sql`
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
      const rows = unwrapPgRows<PaywallRow>(result)
      const totalConversions = pipe(
        rows,
        Array.reduce(0, (acc, r) => acc + r.n)
      )
      return {
        totalConversions,
        byLimit: Array.map(rows, (r) => ({
          label: r.label,
          count: r.n,
        })),
      }
    }).pipe(Effect.withSpan('AnalyticsRepository.paywallAttribution'))

    const signupToFirstPlant = Effect.gen(function* () {
      const result = yield* db.execute(sql`
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
      const rows = unwrapPgRows<SignupFunnelRow>(result)
      const row = pipe(
        Array.head(rows),
        Option.getOrElse(
          (): SignupFunnelRow => ({
            cohort_size: 0,
            with_plant: 0,
            median_hours: null,
          })
        )
      )
      const cohortSize = row.cohort_size
      const pct = (n: number) =>
        cohortSize === 0 ? 0 : Math.round((n / cohortSize) * 100) / 100
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
            pctOfStart: pct(row.with_plant),
          },
        ],
        medianHoursToFirstPlant: row.median_hours,
      }
    }).pipe(Effect.withSpan('AnalyticsRepository.signupToFirstPlant'))

    const trialToPaid = Effect.gen(function* () {
      const result = yield* db.execute(sql`
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
      const rows = unwrapPgRows<TrialFunnelRow>(result)
      const row = pipe(
        Array.head(rows),
        Option.getOrElse(
          (): TrialFunnelRow => ({
            trials_started: 0,
            converted: 0,
            median_days: null,
          })
        )
      )
      const rate =
        row.trials_started === 0 ? 0 : row.converted / row.trials_started
      return {
        trialsStarted: row.trials_started,
        converted: row.converted,
        conversionRate: rate,
        medianDaysToConvert: row.median_days,
      }
    }).pipe(Effect.withSpan('AnalyticsRepository.trialToPaid'))

    const notificationToCareAction = Effect.fn(
      'AnalyticsRepository.notificationToCareAction'
    )(function* (range: AnalyticsRange) {
      // sql.raw is safe here: CARE_REMINDER_TYPES is a hardcoded `as const`
      // tuple, nothing dynamic flows in. Parameterized ANY(array) doesn't
      // work cleanly because drizzle/pg can't infer text[] type in this
      // position without explicit casts on both sides.
      const reminderTypes = sql.raw(
        CARE_REMINDER_TYPES.map((t) => `'${t}'`).join(', ')
      )
      const result = yield* db.execute(sql`
          WITH reminders AS (
            SELECT id, plant_id, sent_at
            FROM notifications
            WHERE type IN (${reminderTypes})
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
      const rows = unwrapPgRows<NotificationFunnelRow>(result)
      const row = pipe(
        Array.head(rows),
        Option.getOrElse(
          (): NotificationFunnelRow => ({
            reminders_sent: 0,
            acted_within_24h: 0,
          })
        )
      )
      const rate =
        row.reminders_sent === 0 ? 0 : row.acted_within_24h / row.reminders_sent
      return {
        remindersSent: row.reminders_sent,
        actedOnWithin24h: row.acted_within_24h,
        actionRate: rate,
      }
    })

    const encodeSnapshotValue = Schema.encode(Schema.parseJson(Schema.Unknown))

    const writeSnapshot = (
      date: string,
      metricKey: AnalyticsMetricKey,
      value: unknown
    ) =>
      Effect.gen(function* () {
        const jsonValue = yield* encodeSnapshotValue(value).pipe(Effect.orDie)
        yield* db.execute(sql`
          INSERT INTO analytics_daily_snapshots (date, metric_key, value, created_at, updated_at)
          VALUES (${date}, ${metricKey}, ${jsonValue}::jsonb, NOW(), NOW())
          ON CONFLICT (date, metric_key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `)
      }).pipe(
        Effect.asVoid,
        Effect.withSpan('AnalyticsRepository.writeSnapshot', {
          attributes: { 'metric.key': metricKey, 'metric.date': date },
        })
      )

    const computeMrrSnapshot = Effect.gen(function* () {
      const result = yield* db.execute(sql`
        SELECT COALESCE(SUM(st.price_monthly), 0)::int AS cents
        FROM user_subscriptions s
        INNER JOIN subscription_tiers st ON st.tier = s.tier
        WHERE s.status = 'active'
          AND s.tier = 'paid'
      `)
      const rows = unwrapPgRows<{ cents: number }>(result)
      return {
        cents: pipe(
          Array.head(rows),
          Option.map((r) => r.cents),
          Option.getOrElse(() => 0)
        ),
      }
    }).pipe(Effect.withSpan('AnalyticsRepository.computeMrrSnapshot'))

    const computeDauWauMauSnapshot = Effect.gen(function* () {
      // One pass over activity with FILTER aggregates, pruned to 30d at source
      // so the UNION ALL never materializes older rows.
      const result = yield* db.execute(sql`
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
      const rows = unwrapPgRows<{ dau: number; wau: number; mau: number }>(
        result
      )
      return pipe(
        Array.head(rows),
        Option.getOrElse(() => ({ dau: 0, wau: 0, mau: 0 }))
      )
    }).pipe(Effect.withSpan('AnalyticsRepository.computeDauWauMauSnapshot'))

    const computePaidChurnSnapshot = Effect.gen(function* () {
      // Monthly churn for the previous calendar month — the current one isn't
      // over, so running totals would monotonically grow and mislead.
      const result = yield* db.execute(sql`
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
      const rows = unwrapPgRows<ChurnComputeRow>(result)
      const row = pipe(
        Array.head(rows),
        Option.getOrElse(
          (): ChurnComputeRow => ({ canceled: 0, active_start: 0 })
        )
      )
      const rate = row.active_start === 0 ? 0 : row.canceled / row.active_start
      return { rate, canceled: row.canceled, activeStart: row.active_start }
    }).pipe(Effect.withSpan('AnalyticsRepository.computePaidChurnSnapshot'))

    const readSnapshots = (metricKey: AnalyticsMetricKey, days: number) =>
      Effect.gen(function* () {
        // Explicit ::int cast ensures pg treats the bind param as integer so
        // `DATE - INTEGER` (day subtraction) resolves unambiguously.
        const result = yield* db.execute(sql`
          SELECT to_char(date, 'YYYY-MM-DD') AS date, value
          FROM analytics_daily_snapshots
          WHERE metric_key = ${metricKey}
            AND date >= CURRENT_DATE - (${days})::int
          ORDER BY date ASC
        `)
        return unwrapPgRows<SnapshotReadRow>(result)
      })

    const getMrrEstimate = Effect.gen(function* () {
      const rows = yield* readSnapshots('mrr_estimate', 30)
      const trend = Array.map(rows, (r) => ({
        date: r.date,
        value: pipe(
          decodeMrr(r.value),
          Option.map((v) => v.cents),
          Option.getOrElse(() => 0)
        ),
      }))
      const currentCents = pipe(
        Array.last(trend),
        Option.map((p) => p.value),
        Option.getOrElse(() => 0)
      )
      return { currentCents, trend }
    }).pipe(Effect.withSpan('AnalyticsRepository.getMrrEstimate'))

    const getDauWauMau = Effect.gen(function* () {
      const rows = yield* readSnapshots('dau_wau_mau', 30)
      const decoded = Array.map(rows, (r) => ({
        date: r.date,
        triple: pipe(
          decodeDau(r.value),
          Option.getOrElse(() => ({ dau: 0, wau: 0, mau: 0 }))
        ),
      }))
      const latest = pipe(
        Array.last(decoded),
        Option.map((r) => r.triple),
        Option.getOrElse(() => ({ dau: 0, wau: 0, mau: 0 }))
      )
      const stickiness = latest.mau === 0 ? 0 : latest.dau / latest.mau
      const trend = Array.map(decoded, (r) => ({
        date: r.date,
        value: r.triple.dau,
      }))
      return {
        dau: latest.dau,
        wau: latest.wau,
        mau: latest.mau,
        stickiness,
        trend,
      }
    }).pipe(Effect.withSpan('AnalyticsRepository.getDauWauMau'))

    const getPaidChurn = Effect.gen(function* () {
      const rows = yield* readSnapshots('paid_churn_monthly', 365)
      const trend = Array.map(rows, (r) => ({
        date: r.date,
        value: pipe(
          decodeChurn(r.value),
          Option.map((v) => v.rate),
          Option.getOrElse(() => 0)
        ),
      }))
      const currentRate = pipe(
        Array.last(trend),
        Option.map((p) => p.value),
        Option.getOrElse(() => 0)
      )
      return { currentRate, trend }
    }).pipe(Effect.withSpan('AnalyticsRepository.getPaidChurn'))

    return {
      usersByStatus,
      activeSubscribersByTier,
      plantsPerUserDistribution,
      careLogVolumeByType,
      deadLetterVolume,
      aiChatVolume,
      diagnosisResolutionRate,
      paywallAttribution,
      signupToFirstPlant,
      trialToPaid,
      notificationToCareAction,
      writeSnapshot,
      computeMrrSnapshot,
      computeDauWauMauSnapshot,
      computePaidChurnSnapshot,
      getMrrEstimate,
      getDauWauMau,
      getPaidChurn,
    }
  })
)
