import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  careLogs,
  plantPhotos,
  plantScans,
  plants,
  userAchievements,
  users,
} from '@lily/db'
import type { AchievementKey } from '@lily/shared'
import { and, count, eq, sql } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

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
    type: 'watering' | 'fertilization'
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
          .where(eq(userAchievements.userId, userId)),

      hasAchievement: (userId: string, key: AchievementKey) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ count: count() })
            .from(userAchievements)
            .where(
              and(
                eq(userAchievements.userId, userId),
                eq(userAchievements.achievement, key)
              )
            )
          return (result?.count ?? 0) > 0
        }),

      unlock: (userId: string, key: AchievementKey) =>
        Effect.gen(function* () {
          const [achievement] = yield* db
            .insert(userAchievements)
            .values({ userId, achievement: key })
            .onConflictDoNothing()
            .returning()
          return achievement ?? null
        }),

      countCareLogsByType: (
        userId: string,
        type: 'watering' | 'fertilization'
      ) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ count: count() })
            .from(careLogs)
            .innerJoin(plants, eq(careLogs.plantId, plants.id))
            .where(and(eq(plants.userId, userId), eq(careLogs.type, type)))
          return result?.count ?? 0
        }),

      countPlants: (userId: string) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ count: count() })
            .from(plants)
            .where(eq(plants.userId, userId))
          return result?.count ?? 0
        }),

      countPhotos: (userId: string) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ count: count() })
            .from(plantPhotos)
            .innerJoin(plants, eq(plantPhotos.plantId, plants.id))
            .where(eq(plants.userId, userId))
          return result?.count ?? 0
        }),

      getCareStreak: (userId: string) =>
        Effect.gen(function* () {
          // Count consecutive days with care logs
          const result = yield* db.execute(sql`
            WITH daily_care AS (
              SELECT DISTINCT DATE(cl.date) as care_date
              FROM care_logs cl
              INNER JOIN plants p ON cl.plant_id = p.id
              WHERE p.user_id = ${userId}
              ORDER BY care_date DESC
            ),
            streak AS (
              SELECT care_date,
                     care_date - (ROW_NUMBER() OVER (ORDER BY care_date DESC))::int AS grp
              FROM daily_care
            )
            SELECT COUNT(*) as streak
            FROM streak
            WHERE grp = (SELECT grp FROM streak LIMIT 1)
          `)
          return Number(result[0]?.streak ?? 0)
        }),

      countScans: (userId: string) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ count: count() })
            .from(plantScans)
            .where(eq(plantScans.userId, userId))
          return result?.count ?? 0
        }),

      countPhotosForPlant: (userId: string, plantId: string) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ count: count() })
            .from(plantPhotos)
            .innerJoin(plants, eq(plantPhotos.plantId, plants.id))
            .where(
              and(eq(plants.userId, userId), eq(plantPhotos.plantId, plantId))
            )
          return result?.count ?? 0
        }),

      incrementHistoryViews: (userId: string) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .update(users)
            .set({
              historyViewCount: sql`${users.historyViewCount} + 1`,
            })
            .where(eq(users.id, userId))
            .returning({ historyViewCount: users.historyViewCount })
          return result?.historyViewCount ?? 0
        }),

      getHistoryViewCount: (userId: string) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ historyViewCount: users.historyViewCount })
            .from(users)
            .where(eq(users.id, userId))
          return result?.historyViewCount ?? 0
        }),
    }
  })
)
