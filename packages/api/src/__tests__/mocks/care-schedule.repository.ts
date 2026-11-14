import type { MockMembership } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareReads } from '@lily/api/__tests__/mocks/care-reads'
import type { CareReads } from '@lily/api/contexts/care'
import {
  CareScheduleRepository,
  type CareScheduleRow,
  type CareType,
  type ICareScheduleRepository,
  type OwnerScheduleRow,
  type ReminderAudiencePlant,
} from '@lily/api/repositories/care-schedule.repository'
import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
import type { plants } from '@lily/db/schema'
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
  caretakers?: Array<{ plantId: string; caretakerId: string }>
  /** Care timezone by owner id (user id or canopy id). Defaults to UTC. */
  timezones?: Readonly<Record<string, string>>
  dueUnlessScheduled?: boolean
}

export const createMockCareScheduleRepository = (
  data: MockCareScheduleData = {}
): Layer.Layer<CareScheduleRepository | CareReads> => {
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
  const caretakers = data.caretakers ?? []

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

  const recipientOf = (p: PlantRecord, userId: string) =>
    p.userId === null
      ? userId
      : pipe(
          Array.findFirst(caretakers, (c) => c.plantId === p.id),
          Option.map((c) => c.caretakerId),
          Option.getOrElse(() => userId)
        )

  const _resolveRoom = (roomId: string | null) =>
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

    findReminderAudience: (plantIds: ReadonlyArray<string>) =>
      Effect.succeed(
        pipe(
          plantsData,
          Array.filter(
            (p) =>
              Array.contains(plantIds, p.id) &&
              p.diedAt === null &&
              p.remindersEnabled
          ),
          Array.flatMap((plant) =>
            Array.map(
              recipientsOf(plant),
              (userId): ReminderAudiencePlant => ({
                id: plant.id,
                name: plant.name,
                audienceUserId: userId,
                owner: ownerOf(plant),
                recipientId: recipientOf(plant, userId),
                dateAdded: plant.dateAdded,
              })
            )
          ),
          Array.groupBy((p) => p.audienceUserId)
        )
      ),

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
  }

  return Layer.mergeAll(
    Layer.succeed(CareScheduleRepository, repo),
    createMockCareReads({
      schedules: schedulesData,
      plants: plantsData,
      rooms: roomsData,
      mutes,
      ...(data.timezones ? { timezones: data.timezones } : {}),
      ...(data.dueUnlessScheduled ? { dueUnlessScheduled: true } : {}),
    })
  )
}
