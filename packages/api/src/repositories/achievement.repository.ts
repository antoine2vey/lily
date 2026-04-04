import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  careLogs,
  plantPhotos,
  plantScans,
  plants,
  userAchievements,
  users,
} from '@lily/db/schema'
import type { AchievementKey, CareType } from '@lily/shared'
import { and, count, eq, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import { unwrapPgRows } from './helpers/pagination'

export interface IAchievementRepository {
  readonly findByUserId: (
    userId: string
  ) => Effect.Effect<Array<typeof userAchievements.$inferSelect>, SqlError>

  readonly hasAchievement: (
    userId: string,
    key: AchievementKey
  ) => Effect.Effect<boolean, SqlError>

  readonly unlock: (
    userId: string,
    key: AchievementKey
  ) => Effect.Effect<typeof userAchievements.$inferSelect | null, SqlError>

  readonly countCareLogsByType: (
    userId: string,
    type: CareType
  ) => Effect.Effect<number, SqlError>

  readonly countPlants: (userId: string) => Effect.Effect<number, SqlError>

  readonly countPhotos: (userId: string) => Effect.Effect<number, SqlError>

  readonly getCareStreak: (userId: string) => Effect.Effect<number, SqlError>

  readonly countScans: (userId: string) => Effect.Effect<number, SqlError>

  readonly countPhotosForPlant: (
    userId: string,
    plantId: string
  ) => Effect.Effect<number, SqlError>

  readonly incrementHistoryViews: (
    userId: string
  ) => Effect.Effect<number, SqlError>

  readonly getHistoryViewCount: (
    userId: string
  ) => Effect.Effect<number, SqlError>

  readonly findUserIdsWithPlants: () => Effect.Effect<string[], SqlError>

  readonly getBatchCareStreaks: (
    userIds: readonly string[]
  ) => Effect.Effect<ReadonlyMap<string, number>, SqlError>
}

export class AchievementRepository extends Context.Tag('AchievementRepository')<
  AchievementRepository,
  IAchievementRepository
>() {}

export const AchievementRepositoryLive = Layer.effect(
  AchievementRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findByUserId: (userId: string) =>
        db
          .select()
          .from(userAchievements)
          .where(eq(userAchievements.userId, userId))
          .pipe(Effect.withSpan('AchievementRepository.findByUserId')),

      hasAchievement: Effect.fn('AchievementRepository.hasAchievement')(
        function* (userId: string, key: AchievementKey) {
          const [result] = yield* db
            .select({ count: count() })
            .from(userAchievements)
            .where(
              and(
                eq(userAchievements.userId, userId),
                eq(userAchievements.achievement, key)
              )
            )
          return (
            pipe(
              Option.fromNullable(result),
              Option.flatMap((r) => Option.fromNullable(r.count)),
              Option.getOrElse(() => 0)
            ) > 0
          )
        }
      ),

      unlock: Effect.fn('AchievementRepository.unlock')(function* (
        userId: string,
        key: AchievementKey
      ) {
        const [achievement] = yield* db
          .insert(userAchievements)
          .values({ userId, achievement: key })
          .onConflictDoNothing()
          .returning()
        return Option.getOrNull(Option.fromNullable(achievement))
      }),

      countCareLogsByType: Effect.fn(
        'AchievementRepository.countCareLogsByType'
      )(function* (userId: string, type: CareType) {
        const [result] = yield* db
          .select({ count: count() })
          .from(careLogs)
          .innerJoin(plants, eq(careLogs.plantId, plants.id))
          .where(and(eq(plants.userId, userId), eq(careLogs.type, type)))
        return pipe(
          Option.fromNullable(result),
          Option.flatMap((r) => Option.fromNullable(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      countPlants: Effect.fn('AchievementRepository.countPlants')(function* (
        userId: string
      ) {
        const [result] = yield* db
          .select({ count: count() })
          .from(plants)
          .where(eq(plants.userId, userId))
        return pipe(
          Option.fromNullable(result),
          Option.flatMap((r) => Option.fromNullable(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      countPhotos: Effect.fn('AchievementRepository.countPhotos')(function* (
        userId: string
      ) {
        const [result] = yield* db
          .select({ count: count() })
          .from(plantPhotos)
          .innerJoin(plants, eq(plantPhotos.plantId, plants.id))
          .where(eq(plants.userId, userId))
        return pipe(
          Option.fromNullable(result),
          Option.flatMap((r) => Option.fromNullable(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      getCareStreak: Effect.fn('AchievementRepository.getCareStreak')(
        function* (userId: string) {
          // Count consecutive days with care logs ending today or yesterday.
          // ROW_NUMBER must be ASC so that consecutive dates produce the same
          // group key (care_date - rn gives the same value for each run).
          // We then pick the group of the most recent date and count its rows.
          const result = yield* db.execute(sql`
            WITH daily_care AS (
              SELECT DISTINCT DATE(cl.date) as care_date
              FROM care_logs cl
              INNER JOIN plants p ON cl.plant_id = p.id
              WHERE p.user_id = ${userId}
            ),
            streak AS (
              SELECT care_date,
                     care_date - (ROW_NUMBER() OVER (ORDER BY care_date ASC))::int AS grp
              FROM daily_care
            ),
            latest_grp AS (
              SELECT grp FROM streak ORDER BY care_date DESC LIMIT 1
            )
            SELECT COUNT(*) as streak
            FROM streak
            WHERE grp = (SELECT grp FROM latest_grp)
              AND (SELECT care_date FROM streak ORDER BY care_date DESC LIMIT 1)
                    >= CURRENT_DATE - INTERVAL '1 day'
          `)
          return Number(
            pipe(
              unwrapPgRows<{ streak: unknown }>(result),
              Array.head,
              Option.flatMap((row) => Option.fromNullable(row.streak)),
              Option.getOrElse(() => 0)
            )
          )
        }
      ),

      countScans: Effect.fn('AchievementRepository.countScans')(function* (
        userId: string
      ) {
        const [result] = yield* db
          .select({ count: count() })
          .from(plantScans)
          .where(eq(plantScans.userId, userId))
        return pipe(
          Option.fromNullable(result),
          Option.flatMap((r) => Option.fromNullable(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      countPhotosForPlant: Effect.fn(
        'AchievementRepository.countPhotosForPlant'
      )(function* (userId: string, plantId: string) {
        const [result] = yield* db
          .select({ count: count() })
          .from(plantPhotos)
          .innerJoin(plants, eq(plantPhotos.plantId, plants.id))
          .where(
            and(eq(plants.userId, userId), eq(plantPhotos.plantId, plantId))
          )
        return pipe(
          Option.fromNullable(result),
          Option.flatMap((r) => Option.fromNullable(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      incrementHistoryViews: Effect.fn(
        'AchievementRepository.incrementHistoryViews'
      )(function* (userId: string) {
        const [result] = yield* db
          .update(users)
          .set({
            historyViewCount: sql`${users.historyViewCount} + 1`,
          })
          .where(eq(users.id, userId))
          .returning({ historyViewCount: users.historyViewCount })
        return pipe(
          Option.fromNullable(result),
          Option.flatMap((r) => Option.fromNullable(r.historyViewCount)),
          Option.getOrElse(() => 0)
        )
      }),

      getHistoryViewCount: Effect.fn(
        'AchievementRepository.getHistoryViewCount'
      )(function* (userId: string) {
        const [result] = yield* db
          .select({ historyViewCount: users.historyViewCount })
          .from(users)
          .where(eq(users.id, userId))
        return pipe(
          Option.fromNullable(result),
          Option.flatMap((r) => Option.fromNullable(r.historyViewCount)),
          Option.getOrElse(() => 0)
        )
      }),

      findUserIdsWithPlants: Effect.fn(
        'AchievementRepository.findUserIdsWithPlants'
      )(function* () {
        const result = yield* db
          .selectDistinct({ userId: plants.userId })
          .from(plants)
        return Array.map(result, (r) => r.userId)
      }),

      getBatchCareStreaks: Effect.fn(
        'AchievementRepository.getBatchCareStreaks'
      )(function* (userIds: readonly string[]) {
        if (userIds.length === 0) return new Map<string, number>()

        const result = yield* db.execute(sql`
          WITH daily_care AS (
            SELECT DISTINCT p.user_id, DATE(cl.date) AS care_date
            FROM care_logs cl
            INNER JOIN plants p ON cl.plant_id = p.id
            WHERE p.user_id IN (${sql.join(
              userIds.map((id) => sql`${id}`),
              sql`, `
            )})
              AND cl.date >= CURRENT_DATE - INTERVAL '400 days'
          ),
          streak AS (
            SELECT user_id, care_date,
                   care_date - (ROW_NUMBER() OVER (
                     PARTITION BY user_id ORDER BY care_date ASC
                   ))::int AS grp
            FROM daily_care
          ),
          latest_grp AS (
            SELECT DISTINCT ON (user_id) user_id, grp, care_date
            FROM streak
            ORDER BY user_id, care_date DESC
          )
          SELECT s.user_id, COUNT(*) AS streak
          FROM streak s
          JOIN latest_grp lg ON lg.user_id = s.user_id AND lg.grp = s.grp
          WHERE lg.care_date >= CURRENT_DATE - INTERVAL '1 day'
          GROUP BY s.user_id
        `)
        const rows = unwrapPgRows<{ user_id: string; streak: unknown }>(result)
        return new Map(
          Array.map(rows, (r) => [r.user_id, Number(r.streak)] as const)
        )
      }),
    }
  })
)
