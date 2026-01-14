import {
  CareLogRepository,
  type FindCareLogsParams,
  type ICareLogRepository,
} from '@lily/api/repositories/care-log.repository'
import { paginate } from '@lily/shared'
import type { CareLog } from '@lily/shared/care-log'
import { Array, Effect, Layer, Option, pipe } from 'effect'

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
      const sorted = [...filtered].sort(
        (a, b) => b.date.getTime() - a.date.getTime()
      )

      const total = sorted.length
      const items = sorted.slice(offset, offset + limit)

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
  }

  return Layer.succeed(CareLogRepository, repo)
}
