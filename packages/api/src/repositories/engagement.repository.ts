import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { extractCount } from '@lily/api/repositories/helpers/pagination'
import {
  careLogs,
  notifications,
  plantPhotos,
  plants,
  userSubscriptions,
  users,
} from '@lily/db/schema'
import type { LanguageCode } from '@lily/shared'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
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
  readonly dateAdded: Date
}

export interface PlantAnniversary {
  readonly plantId: string
  readonly plantName: string
  readonly userId: string
  readonly dateAdded: Date
}

export interface TrialingUser {
  readonly id: string
  readonly timezone: string | null
  readonly doNotDisturb: boolean
  readonly doNotDisturbStart: string | null
  readonly doNotDisturbEnd: string | null
  readonly language: LanguageCode
  readonly trialEndsAt: Date
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
  readonly getUsersWithCareRemindersEnabled: () => Effect.Effect<
    ReadonlyArray<UserWithSettings>,
    SqlError
  >
  readonly getUsersWithWeeklyDigestEnabled: () => Effect.Effect<
    ReadonlyArray<UserWithSettings>,
    SqlError
  >
  readonly getTrialingUsersWithTrialEndingSoon: (
    daysLeft: number
  ) => Effect.Effect<ReadonlyArray<TrialingUser>, SqlError>
  readonly getPlantsWithAnniversary: (
    monthsAgo: readonly number[]
  ) => Effect.Effect<ReadonlyArray<PlantAnniversary>, SqlError>
  readonly getHealthyPlantCountForUser: (
    userId: string
  ) => Effect.Effect<number, SqlError>
  readonly getCareLogsCountForWeek: (
    userId: string,
    timezone: string
  ) => Effect.Effect<number, SqlError>
}

export class EngagementRepository extends Context.Tag('EngagementRepository')<
  EngagementRepository,
  IEngagementRepository
>() {}

export const EngagementRepositoryLive = Layer.effect(
  EngagementRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const userSettingsSelection = {
      id: users.id,
      tips: users.tips,
      personalizedTips: users.personalizedTips,
      timezone: users.timezone,
      doNotDisturb: users.doNotDisturb,
      doNotDisturbStart: users.doNotDisturbStart,
      doNotDisturbEnd: users.doNotDisturbEnd,
      language: users.language,
      createdAt: users.createdAt,
    }

    return {
      getUsersWithTipsEnabled: Effect.fn(
        'EngagementRepository.getUsersWithTipsEnabled'
      )(function* () {
        return yield* db
          .select(userSettingsSelection)
          .from(users)
          .where(eq(users.tips, true))
      }),

      getLastCareDate: Effect.fn('EngagementRepository.getLastCareDate')(
        function* (userId: string) {
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
        }
      ),

      getPlantCountForUser: Effect.fn(
        'EngagementRepository.getPlantCountForUser'
      )(function* (userId: string) {
        const [result] = yield* db
          .select({ value: count() })
          .from(plants)
          .where(eq(plants.userId, userId))

        return pipe(
          Option.fromNullable(result),
          Option.flatMap((r) => Option.fromNullable(r.value)),
          Option.getOrElse(() => 0)
        )
      }),

      getPlantNamesForUser: Effect.fn(
        'EngagementRepository.getPlantNamesForUser'
      )(function* (userId: string) {
        const rows = yield* db
          .select({ name: plants.name })
          .from(plants)
          .where(eq(plants.userId, userId))

        return Array.map(rows, (r) => r.name)
      }),

      getPlantsWithoutRecentPhoto: Effect.fn(
        'EngagementRepository.getPlantsWithoutRecentPhoto'
      )(function* (userId: string, beforeDate: Date) {
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
            dateAdded: plants.dateAdded,
          })
          .from(plants)
          .leftJoin(plantPhotos, eq(plantPhotos.plantId, plants.id))
          .where(eq(plants.userId, userId))
          .groupBy(plants.id, plants.name, plants.userId, plants.dateAdded)
          .having(
            sql`(MAX(${plantPhotos.takenAt}) IS NOT NULL AND MAX(${plantPhotos.takenAt}) < ${beforeDate}) OR (MAX(${plantPhotos.takenAt}) IS NULL AND ${plants.dateAdded} < ${beforeDate})`
          )

        return rows
      }),

      hasNotificationInPeriod: Effect.fn(
        'EngagementRepository.hasNotificationInPeriod'
      )(function* (userId: string, type: string, sinceDate: Date) {
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
      }),

      hasNotificationForPlantInPeriod: Effect.fn(
        'EngagementRepository.hasNotificationForPlantInPeriod'
      )(function* (
        userId: string,
        type: string,
        plantId: string,
        sinceDate: Date
      ) {
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
      }),

      getUsersWithCareRemindersEnabled: Effect.fn(
        'EngagementRepository.getUsersWithCareRemindersEnabled'
      )(function* () {
        return yield* db
          .select(userSettingsSelection)
          .from(users)
          .where(eq(users.careReminders, true))
      }),

      getUsersWithWeeklyDigestEnabled: Effect.fn(
        'EngagementRepository.getUsersWithWeeklyDigestEnabled'
      )(function* () {
        return yield* db
          .select(userSettingsSelection)
          .from(users)
          .where(eq(users.weeklyDigest, true))
      }),

      getTrialingUsersWithTrialEndingSoon: Effect.fn(
        'EngagementRepository.getTrialingUsersWithTrialEndingSoon'
      )(function* (daysLeft: number) {
        const rows = yield* db
          .select({
            id: users.id,
            timezone: users.timezone,
            doNotDisturb: users.doNotDisturb,
            doNotDisturbStart: users.doNotDisturbStart,
            doNotDisturbEnd: users.doNotDisturbEnd,
            language: users.language,
            trialEndsAt: userSubscriptions.trialEndsAt,
          })
          .from(users)
          .innerJoin(userSubscriptions, eq(users.id, userSubscriptions.userId))
          .where(
            and(
              eq(userSubscriptions.status, 'trialing'),
              sql`${userSubscriptions.trialEndsAt} >= NOW() + INTERVAL '${sql.raw(String(daysLeft - 1))} days' + INTERVAL '12 hours'`,
              sql`${userSubscriptions.trialEndsAt} < NOW() + INTERVAL '${sql.raw(String(daysLeft))} days' + INTERVAL '12 hours'`
            )
          )

        return Array.filterMap(rows, (r) =>
          pipe(
            Option.fromNullable(r.trialEndsAt),
            Option.map((trialEndsAt) => ({
              id: r.id,
              timezone: r.timezone,
              doNotDisturb: r.doNotDisturb,
              doNotDisturbStart: r.doNotDisturbStart,
              doNotDisturbEnd: r.doNotDisturbEnd,
              language: r.language as LanguageCode,
              trialEndsAt,
            }))
          )
        )
      }),

      getPlantsWithAnniversary: Effect.fn(
        'EngagementRepository.getPlantsWithAnniversary'
      )(function* (monthsAgo: readonly number[]) {
        if (Array.isEmptyReadonlyArray(monthsAgo)) return []

        const conditions = Array.map(
          monthsAgo,
          (months) =>
            sql`DATE(${plants.dateAdded}) = CURRENT_DATE - INTERVAL '${sql.raw(String(months))} months'`
        )

        const rows = yield* db
          .select({
            plantId: plants.id,
            plantName: plants.name,
            userId: plants.userId,
            dateAdded: plants.dateAdded,
          })
          .from(plants)
          .where(sql`(${sql.join(conditions, sql` OR `)})`)

        return rows
      }),

      getHealthyPlantCountForUser: Effect.fn(
        'EngagementRepository.getHealthyPlantCountForUser'
      )(function* (userId: string) {
        const result = yield* db
          .select({ value: count() })
          .from(plants)
          .where(
            and(
              eq(plants.userId, userId),
              inArray(plants.health, ['THRIVING', 'HEALTHY'])
            )
          )
        return extractCount(result)
      }),

      getCareLogsCountForWeek: Effect.fn(
        'EngagementRepository.getCareLogsCountForWeek'
      )(function* (userId: string, timezone: string) {
        const startOfWeek = sql`date_trunc('week', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`
        const result = yield* db
          .select({ value: count() })
          .from(careLogs)
          .innerJoin(plants, eq(careLogs.plantId, plants.id))
          .where(
            and(
              eq(plants.userId, userId),
              sql`${careLogs.date} >= ${startOfWeek}`
            )
          )
        return extractCount(result)
      }),
    }
  })
)
