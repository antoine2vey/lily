import type { MockMembership } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareReads } from '@lily/api/__tests__/mocks/care-reads'
import type { CareReads } from '@lily/api/contexts/care'
import {
  CareScheduleRepository,
  type CareScheduleRow,
  type ICareScheduleRepository,
  type ReminderAudiencePlant,
} from '@lily/api/repositories/care-schedule.repository'
import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
import type { plants } from '@lily/db/schema'
import type { ZoneName } from '@lily/shared'
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
  timezones?: Readonly<Record<string, ZoneName>>
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

  const repo: ICareScheduleRepository = {
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
