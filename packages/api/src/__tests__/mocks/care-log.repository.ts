import {
  CareLogRepository,
  type FindCareLogsParams,
  type FindRecentParams,
  type ICareLogRepository,
} from '@lily/api/repositories/care-log.repository'
import { paginate } from '@lily/shared'
import type { CareLog } from '@lily/shared/care-log'
import { Array, Effect, Layer, Option, Order, pipe } from 'effect'

export const createMockCareLogRepository = (
  careLogs: CareLog[],
  options?: {
    todayCountByUser?: Record<string, number>
    performedTodayCountByUser?: Record<string, number>
    countByUser?: Record<string, number>
  }
): Layer.Layer<CareLogRepository> => {
  const repo: ICareLogRepository = {
    findByPlantId: (params: FindCareLogsParams) => {
      const page = pipe(
        Option.fromNullishOr(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullishOr(params.limit),
        Option.getOrElse(() => 20)
      )
      const offset = (page - 1) * limit

      let filtered = Array.filter(
        careLogs,
        (log) => log.plantId === params.plantId
      )

      if (params.type && params.type !== 'all') {
        filtered = Array.filter(filtered, (log) => log.type === params.type)
      }

      // Sort by date descending
      const byDateDesc = Order.flip(
        Order.mapInput(Order.Date, (log: CareLog) => log.date)
      )
      const sorted = Array.sort(filtered, byDateDesc)

      const total = Array.length(sorted)
      const items = pipe(
        sorted,
        Array.drop(offset),
        Array.take(limit),
        Array.map((log) => ({ ...log, performedBy: null }))
      )

      return Effect.succeed(paginate(items, total, page, limit))
    },

    findById: (id: string, plantId: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(
            careLogs,
            (log) => log.id === id && log.plantId === plantId
          ),
          Option.getOrNull
        )
      ),

    findRecentByUserId: (params: FindRecentParams) => {
      const limit = pipe(
        Option.fromNullishOr(params.limit),
        Option.getOrElse(() => 10)
      )

      // Sort by date descending and take limit
      const byDateDesc = Order.flip(
        Order.mapInput(Order.Date, (log: CareLog) => log.date)
      )
      const sorted = Array.sort(careLogs, byDateDesc)
      const items = Array.take(sorted, limit)

      // Map to RecentActivity format (mock plant names)
      const recentActivities = Array.map(items, (log) => ({
        id: log.id,
        type: log.type,
        plantId: log.plantId,
        plantName: `Plant ${log.plantId.slice(-4)}`,
        plantImageUrl: undefined,
        date: log.date,
        notes: log.notes,
      }))

      return Effect.succeed({ items: recentActivities })
    },

    countTodayByUser: (userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullishOr(options?.todayCountByUser),
          Option.flatMap((counts) => Option.fromNullishOr(counts[userId])),
          Option.getOrElse(() => 0)
        )
      ),

    countTodayPerformedByUser: (userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullishOr(options?.performedTodayCountByUser),
          Option.orElse(() => Option.fromNullishOr(options?.todayCountByUser)),
          Option.flatMap((counts) => Option.fromNullishOr(counts[userId])),
          Option.getOrElse(() => 0)
        )
      ),

    countByUser: (userId: string) =>
      Effect.succeed(
        pipe(
          Option.fromNullishOr(options?.countByUser),
          Option.flatMap((counts) => Option.fromNullishOr(counts[userId])),
          Option.getOrElse(() => 0)
        )
      ),
  }

  return Layer.succeed(CareLogRepository, repo)
}
