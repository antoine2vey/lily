import { caredForBy } from '@lily/api/repositories/helpers/care-visibility'
import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { careLogs, plants, users } from '@lily/db/schema'
import type { CareType } from '@lily/shared'
import { CareDay, paginate } from '@lily/shared'
import type {
  CareLog,
  CareLogHistoryItem,
  CareLogsListResponse,
  RecentActivitiesListResponse,
  RecentActivity,
} from '@lily/shared/care-log'
import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface FindCareLogsParams {
  plantId: string
  page?: number
  limit?: number
  type?: CareType | 'all'
}

// Helper to map database row to API CareLog type (null -> undefined)
const mapToCareLog = (row: typeof careLogs.$inferSelect): CareLog => ({
  id: row.id,
  type: row.type,
  notes: Option.getOrUndefined(Option.fromNullishOr(row.notes)),
  date: row.date,
  careDay: CareDay.make(row.careDay),
  photoUrl: Option.getOrUndefined(Option.fromNullishOr(row.photoUrl)),
  plantId: row.plantId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export interface FindRecentParams {
  userId: string
  limit?: number
}

// Repository service interface
export interface ICareLogRepository {
  readonly findByPlantId: (
    params: FindCareLogsParams
  ) => Effect.Effect<CareLogsListResponse, SqlError>
  readonly findById: (
    id: string,
    plantId: string
  ) => Effect.Effect<CareLog | null, SqlError>
  readonly findRecentByUserId: (
    params: FindRecentParams
  ) => Effect.Effect<RecentActivitiesListResponse, SqlError>
  readonly countTodayByUser: (
    userId: string,
    timezone: string,
    canopyId: string | null
  ) => Effect.Effect<number, SqlError>
  readonly countTodayPerformedByUser: (
    userId: string,
    timezone: string
  ) => Effect.Effect<number, SqlError>
  readonly countByUser: (userId: string) => Effect.Effect<number, SqlError>
}

// Tag for dependency injection
export class CareLogRepository extends Context.Service<
  CareLogRepository,
  ICareLogRepository
>()('CareLogRepository') {}

// Live implementation using PgDrizzle
export const CareLogRepositoryLive = Layer.effect(
  CareLogRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findByPlantId: Effect.fn('CareLogRepository.findByPlantId')(function* (
        params: FindCareLogsParams
      ) {
        const { page, limit, offset } = getPaginationParams(params)

        const filterConditions =
          params.type && params.type !== 'all'
            ? and(
                eq(careLogs.plantId, params.plantId),
                eq(careLogs.type, params.type)
              )
            : eq(careLogs.plantId, params.plantId)

        const countResult = yield* db
          .select({ value: count() })
          .from(careLogs)
          .where(filterConditions)
        const total = extractCount(countResult)

        const rows = yield* db
          .select({
            log: careLogs,
            performerId: users.id,
            performerName: users.name,
          })
          .from(careLogs)
          .leftJoin(
            users,
            and(
              eq(users.id, careLogs.performedByUserId),
              isNull(users.deletedAt)
            )
          )
          .where(filterConditions)
          .offset(offset)
          .limit(limit)
          .orderBy(desc(careLogs.date))

        const items = Array.map(
          rows,
          (row): CareLogHistoryItem => ({
            ...mapToCareLog(row.log),
            performedBy: pipe(
              Option.fromNullishOr(row.performerId),
              Option.map((id) => ({ id, name: row.performerName })),
              Option.getOrNull
            ),
          })
        )
        return paginate(items, total, page, limit)
      }),

      findById: Effect.fn('CareLogRepository.findById')(function* (
        id: string,
        plantId: string
      ) {
        const [row] = yield* db
          .select()
          .from(careLogs)
          .where(and(eq(careLogs.id, id), eq(careLogs.plantId, plantId)))
        return row ? mapToCareLog(row) : null
      }),

      findRecentByUserId: Effect.fn('CareLogRepository.findRecentByUserId')(
        function* (params: FindRecentParams) {
          const limit = pipe(
            Option.fromNullishOr(params.limit),
            Option.getOrElse(() => 10)
          )

          const rows = yield* db
            .select({
              id: careLogs.id,
              type: careLogs.type,
              date: careLogs.date,
              careDay: careLogs.careDay,
              notes: careLogs.notes,
              plantId: careLogs.plantId,
              plantName: plants.name,
              plantImageUrl: plants.imageUrl,
            })
            .from(careLogs)
            .innerJoin(plants, eq(careLogs.plantId, plants.id))
            .where(eq(plants.userId, params.userId))
            .orderBy(desc(careLogs.date))
            .limit(limit)

          const items: RecentActivity[] = Array.map(rows, (row) => ({
            id: row.id,
            type: row.type,
            plantId: row.plantId,
            plantName: row.plantName,
            plantImageUrl: Option.getOrUndefined(
              Option.fromNullishOr(row.plantImageUrl)
            ),
            date: row.date,
            careDay: CareDay.make(row.careDay),
            notes: Option.getOrUndefined(Option.fromNullishOr(row.notes)),
          }))

          return { items }
        }
      ),

      countTodayByUser: Effect.fn('CareLogRepository.countTodayByUser')(
        function* (userId: string, timezone: string, canopyId: string | null) {
          const startOfDay = sql`date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`
          const result = yield* db
            .select({ value: count() })
            .from(careLogs)
            .innerJoin(plants, eq(careLogs.plantId, plants.id))
            .where(
              and(
                caredForBy(db, userId, canopyId),
                isLivingPlant(),
                gte(careLogs.date, startOfDay)
              )
            )
          return extractCount(result)
        }
      ),

      countTodayPerformedByUser: Effect.fn(
        'CareLogRepository.countTodayPerformedByUser'
      )(function* (userId: string, timezone: string) {
        const startOfDay = sql`date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`
        const result = yield* db
          .select({ value: count() })
          .from(careLogs)
          .where(
            and(
              eq(careLogs.performedByUserId, userId),
              gte(careLogs.date, startOfDay)
            )
          )
        return extractCount(result)
      }),

      countByUser: Effect.fn('CareLogRepository.countByUser')(function* (
        userId: string
      ) {
        const result = yield* db
          .select({ value: count() })
          .from(careLogs)
          .where(eq(careLogs.performedByUserId, userId))
        return extractCount(result)
      }),
    }
  })
)
