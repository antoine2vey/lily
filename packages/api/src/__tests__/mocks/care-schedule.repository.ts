import {
  CareScheduleRepository,
  type CareScheduleRow,
  type CareType,
  type ICareScheduleRepository,
  type ScheduleWithPlant,
  type UpsertScheduleData,
} from '@lily/api/repositories/care-schedule.repository'
import type { plants } from '@lily/db/schema'
import { earliestOverdueDate } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe } from 'effect'

type PlantRecord = typeof plants.$inferSelect

interface MockRoom {
  id: string
  name: string
  icon: string
}

export interface MockCareScheduleData {
  schedules?: CareScheduleRow[]
  plants?: PlantRecord[]
  rooms?: MockRoom[]
}

export const createMockCareScheduleRepository = (
  data: MockCareScheduleData = {}
): Layer.Layer<CareScheduleRepository> => {
  const schedulesData: CareScheduleRow[] = pipe(
    Option.fromNullable(data.schedules),
    Option.getOrElse(() => [] as CareScheduleRow[])
  )
  const plantsData = pipe(
    Option.fromNullable(data.plants),
    Option.getOrElse(() => [] as PlantRecord[])
  )
  const roomsData = pipe(
    Option.fromNullable(data.rooms),
    Option.getOrElse(() => [] as MockRoom[])
  )

  const resolveRoom = (roomId: string | null) =>
    pipe(
      Option.fromNullable(roomId),
      Option.flatMap((id) => Array.findFirst(roomsData, (r) => r.id === id)),
      Option.getOrNull
    )

  const repo: ICareScheduleRepository = {
    findByPlantAndType: (plantId: string, careType: CareType) =>
      Effect.succeed(
        pipe(
          Array.findFirst(
            schedulesData,
            (s) => s.plantId === plantId && s.careType === careType
          ),
          Option.getOrNull
        )
      ),

    findByPlant: (plantId: string) =>
      Effect.succeed(Array.filter(schedulesData, (s) => s.plantId === plantId)),

    findPendingByUser: (userId: string, cutoff: Date) => {
      const userPlantIds = pipe(
        Array.filter(plantsData, (p) => p.userId === userId),
        Array.map((p) => p.id)
      )

      const pending = Array.filter(
        schedulesData,
        (s) =>
          Array.contains(userPlantIds, s.plantId) &&
          s.nextCareAt !== null &&
          s.nextCareAt.getTime() <= cutoff.getTime()
      )

      return Effect.succeed(
        Array.filterMap(pending, (s) =>
          pipe(
            Array.findFirst(plantsData, (p) => p.id === s.plantId),
            Option.map(
              (plant): ScheduleWithPlant => ({
                schedule: s,
                plant: {
                  id: plant.id,
                  name: plant.name,
                  imageUrl: plant.imageUrl,
                  room: resolveRoom(plant.roomId),
                },
              })
            )
          )
        )
      )
    },

    findOverdueByUser: () => {
      const now = new Date()
      const overdue = Array.filter(
        schedulesData,
        (s) => s.nextCareAt !== null && s.nextCareAt.getTime() <= now.getTime()
      )

      // Group by plant, then by user
      const byPlant = Array.groupBy(overdue, (s) => s.plantId)

      const mapped = pipe(
        Array.fromRecord(byPlant),
        Array.filterMap(([, schedules]) => {
          const first = Array.head(schedules)
          return pipe(
            first,
            Option.flatMap((s) =>
              pipe(
                Array.findFirst(plantsData, (p) => p.id === s.plantId),
                Option.map((plant) => ({
                  id: plant.id,
                  name: plant.name,
                  userId: plant.userId,
                  overdueAt: earliestOverdueDate(
                    Array.map(schedules, (sc) => sc.nextCareAt),
                    now
                  ),
                }))
              )
            )
          )
        })
      )

      return Effect.succeed(Array.groupBy(mapped, (p) => p.userId))
    },

    upsert: (
      plantId: string,
      careType: CareType,
      upsertData: UpsertScheduleData
    ) => {
      const existingIdx = Array.findFirstIndex(
        schedulesData,
        (s) => s.plantId === plantId && s.careType === careType
      )

      if (Option.isSome(existingIdx)) {
        // biome-ignore lint/style/noNonNullAssertion: index is guaranteed valid from findFirstIndex
        const existing = schedulesData[existingIdx.value]!
        const updated: CareScheduleRow = {
          ...existing,
          frequencyDays: upsertData.frequencyDays,
          ...(upsertData.lastCareAt !== undefined
            ? { lastCareAt: upsertData.lastCareAt }
            : {}),
          ...(upsertData.nextCareAt !== undefined
            ? { nextCareAt: upsertData.nextCareAt }
            : {}),
          updatedAt: new Date(),
        }
        schedulesData[existingIdx.value] = updated
        return Effect.succeed(updated)
      }

      const newSchedule: CareScheduleRow = {
        id: `schedule-${crypto.randomUUID()}`,
        plantId,
        careType,
        frequencyDays: upsertData.frequencyDays,
        lastCareAt: upsertData.lastCareAt ?? null,
        nextCareAt: upsertData.nextCareAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      schedulesData.push(newSchedule)
      return Effect.succeed(newSchedule)
    },

    updateByPlantAndType: (
      plantId: string,
      careType: CareType,
      updateData: Partial<
        Pick<CareScheduleRow, 'frequencyDays' | 'lastCareAt' | 'nextCareAt'>
      >
    ) => {
      const idx = Array.findFirstIndex(
        schedulesData,
        (s) => s.plantId === plantId && s.careType === careType
      )
      if (Option.isNone(idx)) return Effect.succeed(null)
      // biome-ignore lint/style/noNonNullAssertion: index is guaranteed valid from findFirstIndex
      const existing = schedulesData[idx.value]!
      const updated: CareScheduleRow = {
        ...existing,
        ...updateData,
        updatedAt: new Date(),
      }
      schedulesData[idx.value] = updated
      return Effect.succeed(updated)
    },

    deleteByPlantAndType: (plantId: string, careType: CareType) => {
      const idx = Array.findFirstIndex(
        schedulesData,
        (s) => s.plantId === plantId && s.careType === careType
      )
      if (Option.isSome(idx)) {
        schedulesData.splice(idx.value, 1)
      }
      return Effect.void
    },
  }

  return Layer.succeed(CareScheduleRepository, repo)
}
