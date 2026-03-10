import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  careLogs,
  notifications,
  plantPhotos,
  plants,
  users,
} from '@lily/db/schema'
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
  readonly language: 'en' | 'fr'
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
          // Find plants that have no photo at all, or whose latest photo
          // is older than beforeDate
          const userPlants = yield* db
            .select({
              plantId: plants.id,
              plantName: plants.name,
              userId: plants.userId,
            })
            .from(plants)
            .where(eq(plants.userId, userId))

          if (userPlants.length === 0) return []

          const plantIds = Array.map(userPlants, (p) => p.plantId)

          // Get latest photo per plant
          const latestPhotos = yield* db
            .select({
              plantId: plantPhotos.plantId,
              lastPhotoAt: sql<Date>`MAX(${plantPhotos.takenAt})`.as(
                'last_photo_at'
              ),
            })
            .from(plantPhotos)
            .where(inArray(plantPhotos.plantId, plantIds as string[]))
            .groupBy(plantPhotos.plantId)

          const photoMap = new Map(
            Array.map(latestPhotos, (p) => [p.plantId, p.lastPhotoAt] as const)
          )

          // Filter plants with no photo or photo older than threshold
          return pipe(
            Array.filter(userPlants, (plant) => {
              const lastPhoto = photoMap.get(plant.plantId)
              if (!lastPhoto) return true // No photo at all
              return lastPhoto.getTime() < beforeDate.getTime()
            }),
            Array.map((plant) => ({
              ...plant,
              lastPhotoAt: photoMap.get(plant.plantId) ?? null,
            }))
          )
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
            .select({ value: count() })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, userId),
                eq(notifications.type, type),
                inArray(notifications.status, ['pending', 'queued', 'sent']),
                sql`${notifications.createdAt} >= ${sinceDate}`
              )
            )

          return (
            pipe(
              Option.fromNullable(result),
              Option.flatMap((r) => Option.fromNullable(r.value)),
              Option.getOrElse(() => 0)
            ) > 0
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
            .select({ value: count() })
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, userId),
                eq(notifications.type, type),
                eq(notifications.plantId, plantId),
                inArray(notifications.status, ['pending', 'queued', 'sent']),
                sql`${notifications.createdAt} >= ${sinceDate}`
              )
            )

          return (
            pipe(
              Option.fromNullable(result),
              Option.flatMap((r) => Option.fromNullable(r.value)),
              Option.getOrElse(() => 0)
            ) > 0
          )
        }).pipe(
          Effect.withSpan(
            'EngagementRepository.hasNotificationForPlantInPeriod'
          )
        ),
    }
  })
)
