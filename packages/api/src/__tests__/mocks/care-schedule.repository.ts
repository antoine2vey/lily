import type { MockMembership } from '@lily/api/__tests__/mocks/canopy.repository'
import {
  CareScheduleRepository,
  type CareScheduleRow,
  type CareType,
  type ICareScheduleRepository,
  type OverdueRecipientPlant,
  type OwnerScheduleRow,
  type ScheduleWithPlant,
  type UpsertScheduleData,
} from '@lily/api/repositories/care-schedule.repository'
import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
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
  memberships?: MockMembership[]
  mutes?: Array<{ userId: string; plantId: string }>
}

export const createMockCareScheduleRepository = (
  data: MockCareScheduleData = {}
): Layer.Layer<CareScheduleRepository> => {
  const schedulesData: CareScheduleRow[] = pipe(
    Option.fromNullishOr(data.schedules),
    Option.getOrElse(() => [] as CareScheduleRow[])
  )
  const plantsData = pipe(
    Option.fromNullishOr(data.plants),
    Option.getOrElse(() => [] as PlantRecord[])
  )
  const roomsData = pipe(
    Option.fromNullishOr(data.rooms),
    Option.getOrElse(() => [] as MockRoom[])
  )
  const memberships = data.memberships ?? []
  const mutes = data.mutes ?? []

  const isMuted = (userId: string, plantId: string) =>
    Array.some(mutes, (m) => m.userId === userId && m.plantId === plantId)

  const caredForBy =
    (userId: string, canopyId: string | null) => (p: PlantRecord) =>
      p.userId === userId ||
      (canopyId !== null && p.canopyId === canopyId && !isMuted(userId, p.id))

  const memberCanopyOf = (userId: string) =>
    pipe(
      Array.findFirst(memberships, (m) => m.userId === userId),
      Option.map((m): string => m.canopyId),
      Option.getOrNull
    )

  const recipientsOf = (p: PlantRecord): ReadonlyArray<string> =>
    p.userId !== null
      ? [p.userId]
      : pipe(
          memberships,
          Array.filter(
            (m) => m.canopyId === p.canopyId && !isMuted(m.userId, p.id)
          ),
          Array.map((m) => m.userId)
        )

  const resolveRoom = (roomId: string | null) =>
    pipe(
      Option.fromNullishOr(roomId),
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

    // Mirrors the live repository: plants in the cemetery never surface in
    // care tasks, overdue sweeps, or vacation rebuilds.
    findPendingByUser: (userId: string, cutoff: Date, canopyId) => {
      const visible = caredForBy(userId, canopyId)
      const userPlantIds = pipe(
        Array.filter(plantsData, (p) => visible(p) && p.diedAt === null),
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
        Array.getSomes(
          Array.map(pending, (s) =>
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
      )
    },

    findOverdueByUser: () => {
      const now = new Date()
      const livingPlantIds = pipe(
        Array.filter(plantsData, (p) => p.diedAt === null),
        Array.map((p) => p.id)
      )
      const overdue = Array.filter(
        schedulesData,
        (s) =>
          Array.contains(livingPlantIds, s.plantId) &&
          s.nextCareAt !== null &&
          s.nextCareAt.getTime() <= now.getTime()
      )

      const byPlant = Array.groupBy(overdue, (s) => s.plantId)

      const mapped = pipe(
        Array.fromRecord(byPlant),
        Array.flatMap(([plantId, schedules]) =>
          pipe(
            Array.findFirst(plantsData, (p) => p.id === plantId),
            Option.map((plant) =>
              Array.map(
                recipientsOf(plant),
                (userId): OverdueRecipientPlant => ({
                  id: plant.id,
                  name: plant.name,
                  userId,
                  owner: ownerOf(plant),
                  dateAdded: plant.dateAdded,
                  overdueAt: earliestOverdueDate(
                    Array.map(schedules, (sc) => sc.nextCareAt),
                    now
                  ),
                })
              )
            ),
            Option.getOrElse((): OverdueRecipientPlant[] => [])
          )
        )
      )

      return Effect.succeed(Array.groupBy(mapped, (p) => p.userId))
    },

    findByOwnerWithPlant: (userId: string) =>
      Effect.succeed(
        pipe(
          Array.filter(
            plantsData,
            (p) =>
              caredForBy(userId, memberCanopyOf(userId))(p) && p.diedAt === null
          ),
          Array.flatMap((plant) =>
            pipe(
              Array.filter(schedulesData, (s) => s.plantId === plant.id),
              Array.map(
                (schedule): OwnerScheduleRow => ({
                  schedule,
                  plant: {
                    id: plant.id,
                    owner: ownerOf(plant),
                    remindersEnabled: plant.remindersEnabled,
                  },
                })
              )
            )
          )
        )
      ),

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
