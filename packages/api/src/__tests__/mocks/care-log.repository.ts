import {
  CareLogRepository,
  type FindCareLogsParams,
  type FindRecentParams,
  type ICareLogRepository,
} from '@lily/api/repositories/care-log.repository'
import { type CareType, paginate } from '@lily/shared'
import type { CareLog } from '@lily/shared/care-log'
import { Array, Effect, Layer, Option, Order, pipe } from 'effect'

export const createMockCareLogRepository = (
  careLogs: CareLog[]
): Layer.Layer<CareLogRepository> => {
  const repo: ICareLogRepository = {
    findByPlantId: (params: FindCareLogsParams) => {
      const page = pipe(
        Option.fromNullable(params.page),
        Option.getOrElse(() => 1)
      )
      const limit = pipe(
        Option.fromNullable(params.limit),
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
      const byDateDesc = Order.reverse(
        Order.mapInput(Order.Date, (log: CareLog) => log.date)
      )
      const sorted = Array.sort(filtered, byDateDesc)

      const total = Array.length(sorted)
      const items = pipe(sorted, Array.drop(offset), Array.take(limit))

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
        Option.fromNullable(params.limit),
        Option.getOrElse(() => 10)
      )

      // Sort by date descending and take limit
      const byDateDesc = Order.reverse(
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

    createMany: (data) =>
      Effect.succeed(
        Array.map(data, (d) => ({
          id: `log-${crypto.randomUUID()}`,
          type: d.type,
          notes: d.notes,
          date: pipe(
            Option.fromNullable(d.date),
            Option.getOrElse(() => new Date())
          ),
          photoUrl: d.photoUrl,
          plantId: d.plantId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      ),

    create: (data) => {
      const newLog: CareLog = {
        id: `log-${crypto.randomUUID()}`,
        type: data.type,
        notes: data.notes,
        date: pipe(
          Option.fromNullable(data.date),
          Option.getOrElse(() => new Date())
        ),
        photoUrl: data.photoUrl,
        plantId: data.plantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      return Effect.succeed(newLog)
    },

    update: (id, data) => {
      const logOption = Array.findFirst(careLogs, (log) => log.id === id)
      return Option.match(logOption, {
        onNone: () => Effect.succeed(null),
        onSome: (log) =>
          Effect.succeed({
            ...log,
            ...(data.notes !== undefined && { notes: data.notes }),
            ...(data.date !== undefined && { date: data.date }),
            ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl }),
            updatedAt: new Date(),
          }),
      })
    },

    delete: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(careLogs, (log) => log.id === id),
          Option.getOrNull
        )
      ),

    findLatestByPlantAndType: (plantId: string, type: CareType) => {
      const byDateDesc = Order.reverse(
        Order.mapInput(Order.Date, (log: CareLog) => log.date)
      )
      const matching = pipe(
        careLogs,
        Array.filter((log) => log.plantId === plantId && log.type === type),
        Array.sort(byDateDesc)
      )
      return Effect.succeed(pipe(Array.head(matching), Option.getOrNull))
    },
  }

  return Layer.succeed(CareLogRepository, repo)
}
