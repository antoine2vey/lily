import {
  CareLogRepository,
  type ICareLogRepository,
} from '@lily/api/repositories/care-log.repository'
import type { CareLog } from '@lily/shared/care-log'
import { Effect, Layer } from 'effect'

export const createMockCareLogRepository = (
  careLogs: CareLog[]
): Layer.Layer<CareLogRepository> => {
  const repo: ICareLogRepository = {
    findByPlantId: (plantId: string, type?: 'watering' | 'fertilization') => {
      let filtered = careLogs.filter((log) => log.plantId === plantId)

      if (type) {
        filtered = filtered.filter((log) => log.type === type)
      }

      // Sort by date descending
      filtered.sort((a, b) => b.date.getTime() - a.date.getTime())

      return Effect.succeed(filtered)
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
