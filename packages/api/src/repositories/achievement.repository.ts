import { writeAccount } from '@lily/api/kernel/locks'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  careLogs,
  plantPhotos,
  plantScans,
  plants,
  userAchievements,
  users,
} from '@lily/db/schema'
import type { AchievementKey, CareType, PlantOwner } from '@lily/shared'
import { and, count, eq, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe, Schema } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'
import { isLivingPlant } from './helpers/living-plant'
import { ownedBy } from './helpers/plant-owner'
import { queryOne, queryRows } from './helpers/raw-query'

const StreakRow = Schema.Struct({ streak: Schema.Finite })
const UserIdRow = Schema.Struct({ user_id: Schema.String })
const UserStreakRow = Schema.Struct({
  user_id: Schema.String,
  streak: Schema.Finite,
})

export interface IAchievementRepository {
  readonly findByUserId: (
    userId: string
  ) => Effect.Effect<Array<typeof userAchievements.$inferSelect>, SqlError>

  readonly countByUserId: (userId: string) => Effect.Effect<number, SqlError>

  readonly unlock: (
    userId: string,
    key: AchievementKey
  ) => Effect.Effect<typeof userAchievements.$inferSelect | null, SqlError>

  readonly countCareLogsByType: (
    userId: string,
    type: CareType
  ) => Effect.Effect<number, SqlError>

  readonly countPlants: (userId: string) => Effect.Effect<number, SqlError>
  /** Living plants only — the plan limit; achievements keep `countPlants`. */
  readonly countLivingPlants: (
    owner: PlantOwner
  ) => Effect.Effect<number, SqlError>

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

  readonly findUserIdsWithProgress: Effect.Effect<string[], SqlError>

  readonly getBatchCareStreaks: (
    userIds: readonly string[]
  ) => Effect.Effect<ReadonlyMap<string, number>, SqlError>
}

export class AchievementRepository extends Context.Service<
  AchievementRepository,
  IAchievementRepository
>()('AchievementRepository') {}

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

      countByUserId: Effect.fn('AchievementRepository.countByUserId')(
        function* (userId: string) {
          const [result] = yield* db
            .select({ count: count() })
            .from(userAchievements)
            .where(eq(userAchievements.userId, userId))
          return pipe(
            Option.fromNullishOr(result),
            Option.flatMap((r) => Option.fromNullishOr(r.count)),
            Option.getOrElse(() => 0)
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
        return Option.getOrNull(Option.fromNullishOr(achievement))
      }),

      countCareLogsByType: Effect.fn(
        'AchievementRepository.countCareLogsByType'
      )(function* (userId: string, type: CareType) {
        const [result] = yield* db
          .select({ count: count() })
          .from(careLogs)
          .where(
            and(eq(careLogs.performedByUserId, userId), eq(careLogs.type, type))
          )
        return pipe(
          Option.fromNullishOr(result),
          Option.flatMap((r) => Option.fromNullishOr(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      countPlants: Effect.fn('AchievementRepository.countPlants')(function* (
        userId: string
      ) {
        const [result] = yield* db
          .select({ count: count() })
          .from(plants)
          .where(eq(plants.createdByUserId, userId))
        return pipe(
          Option.fromNullishOr(result),
          Option.flatMap((r) => Option.fromNullishOr(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      countLivingPlants: Effect.fn('AchievementRepository.countLivingPlants')(
        function* (owner: PlantOwner) {
          const [result] = yield* db
            .select({ count: count() })
            .from(plants)
            .where(and(ownedBy(plants, owner), isLivingPlant()))
          return pipe(
            Option.fromNullishOr(result),
            Option.flatMap((r) => Option.fromNullishOr(r.count)),
            Option.getOrElse(() => 0)
          )
        }
      ),

      countPhotos: Effect.fn('AchievementRepository.countPhotos')(function* (
        userId: string
      ) {
        const [result] = yield* db
          .select({ count: count() })
          .from(plantPhotos)
          .innerJoin(plants, eq(plantPhotos.plantId, plants.id))
          .where(eq(plants.userId, userId))
        return pipe(
          Option.fromNullishOr(result),
          Option.flatMap((r) => Option.fromNullishOr(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      getCareStreak: Effect.fn('AchievementRepository.getCareStreak')(
        function* (userId: string) {
          // Count consecutive days with care logs ending today or yesterday.
          // ROW_NUMBER must be ASC so that consecutive dates produce the same
          // group key (care_date - rn gives the same value for each run).
          // We then pick the group of the most recent date and count its rows.
          const row = yield* db
            .execute(sql`
            WITH daily_care AS (
              SELECT DISTINCT DATE(cl.date) as care_date
              FROM care_logs cl
              WHERE cl.performed_by_user_id = ${userId}
            ),
            streak AS (
              SELECT care_date,
                     care_date - (ROW_NUMBER() OVER (ORDER BY care_date ASC))::int AS grp
              FROM daily_care
            ),
            latest_grp AS (
              SELECT grp FROM streak ORDER BY care_date DESC LIMIT 1
            )
            SELECT COUNT(*)::int AS streak
            FROM streak
            WHERE grp = (SELECT grp FROM latest_grp)
              AND (SELECT care_date FROM streak ORDER BY care_date DESC LIMIT 1)
                    >= CURRENT_DATE - INTERVAL '1 day'
          `)
            .pipe(queryOne(StreakRow))
          return row.streak
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
          Option.fromNullishOr(result),
          Option.flatMap((r) => Option.fromNullishOr(r.count)),
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
          Option.fromNullishOr(result),
          Option.flatMap((r) => Option.fromNullishOr(r.count)),
          Option.getOrElse(() => 0)
        )
      }),

      incrementHistoryViews: Effect.fn(
        'AchievementRepository.incrementHistoryViews'
      )(function* (userId: string) {
        const [result] = yield* writeAccount(
          db,
          userId,
          {
            historyViewCount: sql`${users.historyViewCount} + 1`,
          },
          (written) =>
            written.returning({ historyViewCount: users.historyViewCount })
        )
        return pipe(
          Option.fromNullishOr(result),
          Option.flatMap((r) => Option.fromNullishOr(r.historyViewCount)),
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
          Option.fromNullishOr(result),
          Option.flatMap((r) => Option.fromNullishOr(r.historyViewCount)),
          Option.getOrElse(() => 0)
        )
      }),

      findUserIdsWithProgress: Effect.gen(function* () {
        const rows = yield* db
          .execute(sql`
          SELECT created_by_user_id AS user_id FROM plants
          WHERE created_by_user_id IS NOT NULL
          UNION
          SELECT user_id FROM plants
          WHERE user_id IS NOT NULL
          UNION
          SELECT performed_by_user_id FROM care_logs
          WHERE performed_by_user_id IS NOT NULL
        `)
          .pipe(queryRows(UserIdRow))
        return Array.map(rows, (r) => r.user_id)
      }).pipe(Effect.withSpan('AchievementRepository.findUserIdsWithProgress')),

      getBatchCareStreaks: Effect.fn(
        'AchievementRepository.getBatchCareStreaks'
      )(function* (userIds: readonly string[]) {
        if (userIds.length === 0) return new Map<string, number>()

        const rows = yield* db
          .execute(sql`
          WITH daily_care AS (
            SELECT DISTINCT cl.performed_by_user_id AS user_id, DATE(cl.date) AS care_date
            FROM care_logs cl
            WHERE cl.performed_by_user_id IN (${sql.join(
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
          SELECT s.user_id, COUNT(*)::int AS streak
          FROM streak s
          JOIN latest_grp lg ON lg.user_id = s.user_id AND lg.grp = s.grp
          WHERE lg.care_date >= CURRENT_DATE - INTERVAL '1 day'
          GROUP BY s.user_id
        `)
          .pipe(queryRows(UserStreakRow))
        return new Map(Array.map(rows, (r) => [r.user_id, r.streak] as const))
      }),
    }
  })
)
