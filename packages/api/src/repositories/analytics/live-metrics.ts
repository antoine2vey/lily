import type { AnalyticsRange } from '@lily/api/repositories/analytics.repository'
import { queryOne, queryRows } from '@lily/api/repositories/helpers/raw-query'
import type * as PgDrizzle from '@lily/db/effect-drizzle'
import { SubscriptionStatus, SubscriptionTier, UserStatus } from '@lily/shared'
import { sql } from 'drizzle-orm'
import { Array, Effect, Option, Order, pipe, Record, Schema } from 'effect'

const UsersByStatusRow = Schema.Struct({ status: UserStatus, n: Schema.Finite })

const SubscribersByTierRow = Schema.Struct({
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  n: Schema.Finite,
})

const PlantBucketRow = Schema.Struct({
  bucket: Schema.String,
  users_count: Schema.Finite,
})

const PlantTotalsRow = Schema.Struct({
  users: Schema.Finite,
  plants: Schema.Finite,
})

const CareLogDayRow = Schema.Struct({
  type: Schema.String,
  day: Schema.String,
  n: Schema.Finite,
})

const DeadLetterDayRow = Schema.Struct({
  topic: Schema.String,
  day: Schema.String,
  n: Schema.Finite,
})

const DeadLetterErrorRow = Schema.Struct({
  topic: Schema.String,
  error: Schema.String,
  n: Schema.Finite,
})

const ChatDayRow = Schema.Struct({
  day: Schema.String,
  messages: Schema.Finite,
  users: Schema.Finite,
})

const ChatUniqueRow = Schema.Struct({ total_unique: Schema.Finite })

const PLANT_BUCKETS = ['0', '1', '2-5', '6-10', '11-25', '25+'] as const

const byString = <T>(pick: (x: T) => string): Order.Order<T> =>
  Order.mapInput(Order.String, pick)

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

const total = <R>(rows: ReadonlyArray<R>, count: (r: R) => number) =>
  Array.reduce(rows, 0, (acc, r) => acc + count(r))

/** Point-in-time counts and per-day volumes, read live on each request. */
export const liveMetrics = (db: PgDrizzle.PgDrizzle['Service']) => {
  const usersByStatus = Effect.gen(function* () {
    const rows = yield* db
      .execute(sql`
        SELECT status, count(*)::int AS n
        FROM users
        WHERE deleted_at IS NULL
        GROUP BY status
      `)
      .pipe(queryRows(UsersByStatusRow))
    return {
      total: total(rows, (r) => r.n),
      byStatus: Array.map(rows, (r) => ({ status: r.status, count: r.n })),
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.usersByStatus'))

  const activeSubscribersByTier = Effect.gen(function* () {
    const rows = yield* db
      .execute(sql`
        SELECT tier, status, count(*)::int AS n
        FROM user_subscriptions
        WHERE status IN ('active', 'trialing')
        GROUP BY tier, status
        ORDER BY tier ASC, status ASC
      `)
      .pipe(queryRows(SubscribersByTierRow))
    return {
      total: total(rows, (r) => r.n),
      byTier: Array.map(rows, (r) => ({
        tier: r.tier,
        status: r.status,
        count: r.n,
      })),
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.activeSubscribersByTier'))

  const plantsPerUserDistribution = Effect.gen(function* () {
    const [distribution, totals] = yield* Effect.all(
      [
        db
          .execute(sql`
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
          `)
          .pipe(queryRows(PlantBucketRow)),
        db
          .execute(sql`
            SELECT
              (SELECT count(*)::int FROM users WHERE deleted_at IS NULL) AS users,
              (SELECT count(*)::int
                 FROM plants p
                 INNER JOIN users u ON u.id = p.user_id
                 WHERE u.deleted_at IS NULL) AS plants
          `)
          .pipe(queryOne(PlantTotalsRow)),
      ],
      { concurrency: 2 }
    )

    return {
      totalUsers: totals.users,
      totalPlants: totals.plants,
      buckets: Array.map(PLANT_BUCKETS, (label) => ({
        label,
        count: pipe(
          Array.findFirst(distribution, (r) => r.bucket === label),
          Option.match({ onNone: () => 0, onSome: (r) => r.users_count })
        ),
      })),
    }
  }).pipe(Effect.withSpan('AnalyticsRepository.plantsPerUserDistribution'))

  const careLogVolumeByType = Effect.fn(
    'AnalyticsRepository.careLogVolumeByType'
  )(function* (range: AnalyticsRange) {
    const rows = yield* db
      .execute(sql`
        SELECT
          type,
          to_char(date_trunc('day', date AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
          count(*)::int AS n
        FROM care_logs
        WHERE date >= ${range.from} AND date < ${range.to}
        GROUP BY type, day
        ORDER BY day ASC, type ASC
      `)
      .pipe(queryRows(CareLogDayRow))
    const series = pipe(
      groupPoints(
        rows,
        (r) => r.type,
        (r) => r.day,
        (r) => r.n
      ),
      Record.toEntries,
      Array.map(([type, points]) => ({ type, points })),
      Array.sort(byString<{ type: string }>((x) => x.type))
    )
    return { totalInRange: total(rows, (r) => r.n), series }
  })

  const deadLetterVolume = Effect.fn('AnalyticsRepository.deadLetterVolume')(
    function* (range: AnalyticsRange) {
      const [seriesRows, topErrorRows] = yield* Effect.all(
        [
          db
            .execute(sql`
              SELECT
                topic,
                to_char(date_trunc('day', failed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
                count(*)::int AS n
              FROM dead_letter_messages
              WHERE failed_at >= ${range.from} AND failed_at < ${range.to}
              GROUP BY topic, day
              ORDER BY day ASC, topic ASC
            `)
            .pipe(queryRows(DeadLetterDayRow)),
          db
            .execute(sql`
              SELECT topic, error, count(*)::int AS n
              FROM dead_letter_messages
              WHERE failed_at >= ${range.from} AND failed_at < ${range.to}
              GROUP BY topic, error
              ORDER BY n DESC
              LIMIT 5
            `)
            .pipe(queryRows(DeadLetterErrorRow)),
        ],
        { concurrency: 2 }
      )

      const series = pipe(
        groupPoints(
          seriesRows,
          (r) => r.topic,
          (r) => r.day,
          (r) => r.n
        ),
        Record.toEntries,
        Array.map(([topic, points]) => ({ topic, points })),
        Array.sort(byString<{ topic: string }>((x) => x.topic))
      )
      return {
        totalInRange: total(seriesRows, (r) => r.n),
        series,
        topErrors: Array.map(topErrorRows, (r) => ({
          topic: r.topic,
          error: r.error,
          count: r.n,
        })),
      }
    }
  )

  const aiChatVolume = Effect.fn('AnalyticsRepository.aiChatVolume')(function* (
    range: AnalyticsRange
  ) {
    const [dailyRows, unique] = yield* Effect.all(
      [
        db
          .execute(sql`
              SELECT
                to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
                count(*)::int AS messages,
                count(DISTINCT user_id)::int AS users
              FROM chat_messages
              WHERE created_at >= ${range.from} AND created_at < ${range.to}
              GROUP BY day
              ORDER BY day ASC
            `)
          .pipe(queryRows(ChatDayRow)),
        db
          .execute(sql`
              SELECT count(DISTINCT user_id)::int AS total_unique
              FROM chat_messages
              WHERE created_at >= ${range.from} AND created_at < ${range.to}
            `)
          .pipe(queryOne(ChatUniqueRow)),
      ],
      { concurrency: 2 }
    )

    return {
      totalMessages: total(dailyRows, (r) => r.messages),
      uniqueUsers: unique.total_unique,
      trend: Array.map(dailyRows, (r) => ({
        date: r.day,
        messages: r.messages,
        users: r.users,
      })),
    }
  })

  return {
    usersByStatus,
    activeSubscribersByTier,
    plantsPerUserDistribution,
    careLogVolumeByType,
    deadLetterVolume,
    aiChatVolume,
  }
}
