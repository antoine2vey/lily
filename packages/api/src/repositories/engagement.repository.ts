import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  careLogs,
  notifications,
  plantPhotos,
  plants,
  users,
} from '@lily/db/schema'
import type { LanguageCode } from '@lily/shared'
import { count, desc, eq, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

export interface UserWithSettings {
  readonly id: string
  readonly tips: boolean
  readonly personalizedTips: boolean
  readonly timezone: string | null
  readonly doNotDisturb: boolean
  readonly doNotDisturbStart: string | null
  readonly doNotDisturbEnd: string | null
  readonly language: LanguageCode
  readonly createdAt: Date
}

export interface PlantWithoutRecentPhoto {
  readonly plantId: string
  readonly plantName: string
  readonly userId: string
  readonly lastPhotoAt: Date | null
}

export interface IEngagementRepository {
  readonly getUsersWithTipsEnabled: () => Effect.Effect<
    ReadonlyArray<UserWithSettings>,
    SqlError
  >
  readonly getLastCareDate: (
    userId: string
  ) => Effect.Effect<Date | null, SqlError>
  readonly getPlantCountForUser: (
    userId: string
  ) => Effect.Effect<number, SqlError>
  readonly getPlantNamesForUser: (
    userId: string
  ) => Effect.Effect<ReadonlyArray<string>, SqlError>
  readonly getPlantsWithoutRecentPhoto: (
    userId: string,
    beforeDate: Date
  ) => Effect.Effect<ReadonlyArray<PlantWithoutRecentPhoto>, SqlError>
  readonly hasNotificationInPeriod: (
    userId: string,
    type: string,
    sinceDate: Date
  ) => Effect.Effect<boolean, SqlError>
  readonly hasNotificationForPlantInPeriod: (
    userId: string,
    type: string,
    plantId: string,
    sinceDate: Date
  ) => Effect.Effect<boolean, SqlError>
}

export class EngagementRepository extends Context.Tag('EngagementRepository')<
  EngagementRepository,
  IEngagementRepository
>() {}

export const EngagementRepositoryLive = Layer.effect(
  EngagementRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      getUsersWithTipsEnabled: () =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({
              id: users.id,
              tips: users.tips,
              personalizedTips: users.personalizedTips,
              timezone: users.timezone,
              doNotDisturb: users.doNotDisturb,
              doNotDisturbStart: users.doNotDisturbStart,
              doNotDisturbEnd: users.doNotDisturbEnd,
              language: users.language,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(eq(users.tips, true))

          return rows
        }).pipe(
          Effect.withSpan('EngagementRepository.getUsersWithTipsEnabled')
        ),

      getLastCareDate: (userId: string) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ date: careLogs.date })
            .from(careLogs)
            .innerJoin(plants, eq(careLogs.plantId, plants.id))
            .where(eq(plants.userId, userId))
            .orderBy(desc(careLogs.date))
            .limit(1)

          return pipe(
            Array.head(rows),
            Option.map((r) => r.date),
            Option.getOrNull
          )
        }).pipe(Effect.withSpan('EngagementRepository.getLastCareDate')),

      getPlantCountForUser: (userId: string) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({ value: count() })
            .from(plants)
            .where(eq(plants.userId, userId))

          return pipe(
            Option.fromNullable(result),
            Option.flatMap((r) => Option.fromNullable(r.value)),
            Option.getOrElse(() => 0)
          )
        }).pipe(Effect.withSpan('EngagementRepository.getPlantCountForUser')),

      getPlantNamesForUser: (userId: string) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ name: plants.name })
            .from(plants)
            .where(eq(plants.userId, userId))

          return Array.map(rows, (r) => r.name)
        }).pipe(Effect.withSpan('EngagementRepository.getPlantNamesForUser')),

      getPlantsWithoutRecentPhoto: (userId: string, beforeDate: Date) =>
        Effect.gen(function* () {
          // Single query: LEFT JOIN plants with their latest photo,
          // filter to those with no photo or photo older than threshold
          const rows = yield* db
            .select({
              plantId: plants.id,
              plantName: plants.name,
              userId: plants.userId,
              lastPhotoAt: sql<Date | null>`MAX(${plantPhotos.takenAt})`.as(
                'last_photo_at'
              ),
            })
            .from(plants)
            .leftJoin(plantPhotos, eq(plantPhotos.plantId, plants.id))
            .where(eq(plants.userId, userId))
            .groupBy(plants.id, plants.name, plants.userId)
            .having(
              sql`MAX(${plantPhotos.takenAt}) IS NULL OR MAX(${plantPhotos.takenAt}) < ${beforeDate}`
            )

          return rows
        }).pipe(
          Effect.withSpan('EngagementRepository.getPlantsWithoutRecentPhoto')
        ),

      hasNotificationInPeriod: (
        userId: string,
        type: string,
        sinceDate: Date
      ) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({
              value: sql<boolean>`EXISTS (
                SELECT 1 FROM ${notifications}
                WHERE ${notifications.userId} = ${userId}
                  AND ${notifications.type} = ${type}
                  AND ${notifications.status} IN ('pending', 'queued', 'sent')
                  AND ${notifications.createdAt} >= ${sinceDate}
              )`.as('has_notification'),
            })
            .from(sql`(VALUES (1)) AS _`)

          return pipe(
            Option.fromNullable(result),
            Option.map((r) => r.value),
            Option.getOrElse(() => false)
          )
        }).pipe(
          Effect.withSpan('EngagementRepository.hasNotificationInPeriod')
        ),

      hasNotificationForPlantInPeriod: (
        userId: string,
        type: string,
        plantId: string,
        sinceDate: Date
      ) =>
        Effect.gen(function* () {
          const [result] = yield* db
            .select({
              value: sql<boolean>`EXISTS (
                SELECT 1 FROM ${notifications}
                WHERE ${notifications.userId} = ${userId}
                  AND ${notifications.type} = ${type}
                  AND ${notifications.plantId} = ${plantId}
                  AND ${notifications.status} IN ('pending', 'queued', 'sent')
                  AND ${notifications.createdAt} >= ${sinceDate}
              )`.as('has_notification'),
            })
            .from(sql`(VALUES (1)) AS _`)

          return pipe(
            Option.fromNullable(result),
            Option.map((r) => r.value),
            Option.getOrElse(() => false)
          )
        }).pipe(
          Effect.withSpan(
            'EngagementRepository.hasNotificationForPlantInPeriod'
          )
        ),
    }
  })
)
