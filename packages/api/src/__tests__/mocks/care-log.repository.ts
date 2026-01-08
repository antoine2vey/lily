import {
  CareLogRepository,
  type FindCareLogsParams,
  type ICareLogRepository,
} from '@lily/api/repositories/care-log.repository'
import { paginate } from '@lily/shared'
import type { CareLog } from '@lily/shared/care-log'
import { Effect, Layer } from 'effect'

export const createMockCareLogRepository = (
  careLogs: CareLog[]
): Layer.Layer<CareLogRepository> => {
  const repo: ICareLogRepository = {
    findByPlantId: (params: FindCareLogsParams) => {
      const page = params.page ?? 1
      const limit = params.limit ?? 20
      const offset = (page - 1) * limit

      let filtered = careLogs.filter((log) => log.plantId === params.plantId)

      if (params.type && params.type !== 'all') {
        filtered = filtered.filter((log) => log.type === params.type)
      }

      // Sort by date descending
      filtered.sort((a, b) => b.date.getTime() - a.date.getTime())

      const total = filtered.length
      const items = filtered.slice(offset, offset + limit)

      return Effect.succeed(paginate(items, total, page, limit))
    },

    findById: (id: string, plantId: string) => {
      const log = careLogs.find(
        (log) => log.id === id && log.plantId === plantId
      )
      return Effect.succeed(log ?? null)
    },

    create: (data) => {
      const newLog: CareLog = {
        id: `log-${crypto.randomUUID()}`,
        type: data.type,
        notes: data.notes,
        date: data.date ?? new Date(),
        photoUrl: data.photoUrl,
        plantId: data.plantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      return Effect.succeed(newLog)
    },

    update: (id, data) => {
      const log = careLogs.find((log) => log.id === id)
      if (!log) return Effect.succeed(null)
      return Effect.succeed({
        ...log,
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.date !== undefined && { date: data.date }),
        ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl }),
        updatedAt: new Date(),
      })
    },

    delete: (id) => {
      const log = careLogs.find((log) => log.id === id)
      return Effect.succeed(log ?? null)
    },
  }

  return Layer.succeed(CareLogRepository, repo)
}
