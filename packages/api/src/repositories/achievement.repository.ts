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
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

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
          .where(eq(userAchievements.userId, userId))
          .pipe(Effect.withSpan('AchievementRepository.findByUserId')),

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
          return (
            pipe(
              Option.fromNullable(result),
              Option.flatMap((r) => Option.fromNullable(r.count)),
              Option.getOrElse(() => 0)
            ) > 0
          )
        }).pipe(Effect.withSpan('AchievementRepository.hasAchievement')),

      unlock: (userId: string, key: AchievementKey) =>
        Effect.gen(function* () {
          const [achievement] = yield* db
            .insert(userAchievements)
            .values({ userId, achievement: key })
            .onConflictDoNothing()
            .returning()
          return Option.getOrNull(Option.fromNullable(achievement))
        }).pipe(Effect.withSpan('AchievementRepository.unlock')),

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
          return pipe(
            Option.fromNullable(result),
            Option.flatMap((r) => Option.fromNullable(r.count)),
            Option.getOrElse(() => 0)
          )
        }).pipe(Effect.withSpan('AchievementRepository.countCareLogsByType')),

      countPlants: (userId: string) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ count: count() })
            .from(plants)
            .where(eq(plants.userId, userId))
          return pipe(
            Option.fromNullable(result),
            Option.flatMap((r) => Option.fromNullable(r.count)),
            Option.getOrElse(() => 0)
          )
        }).pipe(Effect.withSpan('AchievementRepository.countPlants')),

      countPhotos: (userId: string) =>
        Effect.gen(function* () {
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
        }).pipe(Effect.withSpan('AchievementRepository.countPhotos')),

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
          return Number(
            pipe(
              Array.head(result),
              Option.flatMap((r) => Option.fromNullable(r.streak)),
              Option.getOrElse(() => 0)
            )
          )
        }).pipe(Effect.withSpan('AchievementRepository.getCareStreak')),

      countScans: (userId: string) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ count: count() })
            .from(plantScans)
            .where(eq(plantScans.userId, userId))
          return pipe(
            Option.fromNullable(result),
            Option.flatMap((r) => Option.fromNullable(r.count)),
            Option.getOrElse(() => 0)
          )
        }).pipe(Effect.withSpan('AchievementRepository.countScans')),

      countPhotosForPlant: (userId: string, plantId: string) =>
        Effect.gen(function* () {
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
        }).pipe(Effect.withSpan('AchievementRepository.countPhotosForPlant')),

      incrementHistoryViews: (userId: string) =>
        Effect.gen(function* () {
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
        }).pipe(Effect.withSpan('AchievementRepository.incrementHistoryViews')),

      getHistoryViewCount: (userId: string) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ historyViewCount: users.historyViewCount })
            .from(users)
            .where(eq(users.id, userId))
          return pipe(
            Option.fromNullable(result),
            Option.flatMap((r) => Option.fromNullable(r.historyViewCount)),
            Option.getOrElse(() => 0)
          )
        }).pipe(Effect.withSpan('AchievementRepository.getHistoryViewCount')),
    }
  })
)
