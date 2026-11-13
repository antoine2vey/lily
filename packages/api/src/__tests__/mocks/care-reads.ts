import {
  CareReads,
  type DueScope,
  makeCareReads,
  type ScheduledCare,
} from '@lily/api/contexts/care'
import { storedDay } from '@lily/api/contexts/care/stored-day'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { ownerOf } from '@lily/api/repositories/helpers/plant-owner'
import type { plants } from '@lily/db/schema'
import { CARE_TYPES, CareDays, type CareType } from '@lily/shared'
import {
  Array,
  DateTime,
  Effect,
  Filter,
  Layer,
  Match,
  Option,
  pipe,
} from 'effect'

type PlantRecord = typeof plants.$inferSelect

export interface MockCareReadsData {
  schedules?: ReadonlyArray<CareScheduleRow>
  plants?: ReadonlyArray<PlantRecord>
  rooms?: ReadonlyArray<{ id: string; name: string; icon: string }>
  mutes?: ReadonlyArray<{ userId: string; plantId: string }>
  /** Care timezone by owner id (user id or canopy id). Defaults to UTC. */
  timezones?: Readonly<Record<string, string>>
  dueUnlessScheduled?: boolean
}

const dueToday = (
  plantId: string,
  careType: CareType,
  dueAt: Date
): ScheduledCare => ({
  careType,
  frequencyDays: 7,
  dueAt,
  dueDay: CareDays.of(DateTime.makeUnsafe(dueAt), 'UTC'),
  careTimezone: 'UTC',
  plant: {
    id: plantId,
    name: plantId,
    imageUrl: null,
    owner: { _tag: 'User', userId: 'user-1' },
    remindersEnabled: true,
    dateAdded: dueAt,
    room: null,
    sharedBy: null,
  },
})

/** The real read model over in-memory rows: same rules, no SQL. */
export const createMockCareReads = (
  data: MockCareReadsData = {}
): Layer.Layer<CareReads> => {
  const mutes = data.mutes ?? []
  const inScope = (scope: DueScope) => (plant: PlantRecord) =>
    Match.valueTags(scope, {
      Everyone: () => true,
      Plants: ({ plantIds }) => Array.contains(plantIds, plant.id),
      CaredForBy: ({ userId, canopyId }) =>
        plant.userId === userId ||
        (canopyId !== null &&
          plant.canopyId === canopyId &&
          !Array.some(
            mutes,
            (m) => m.userId === userId && m.plantId === plant.id
          )),
    })

  const implied = (scope: DueScope, scheduled: ReadonlyArray<ScheduledCare>) =>
    Effect.map(DateTime.now, (now) =>
      data.dueUnlessScheduled && scope._tag === 'Plants'
        ? Array.flatMap(scope.plantIds, (plantId) =>
            pipe(
              CARE_TYPES,
              Array.filter(
                (careType) =>
                  !Array.some(
                    data.schedules ?? [],
                    (s) => s.plantId === plantId && s.careType === careType
                  )
              ),
              Array.map((careType) =>
                dueToday(plantId, careType, DateTime.toDateUtc(now))
              )
            )
          )
        : []
    ).pipe(Effect.map((extra) => [...scheduled, ...extra]))

  return Layer.succeed(
    CareReads,
    makeCareReads((scope, prune) =>
      Effect.flatMap(
        Effect.succeed(
          Array.filterMap(
            data.schedules ?? [],
            Filter.fromPredicateOption((schedule) =>
              pipe(
                Array.findFirst(
                  data.plants ?? [],
                  (p) => p.id === schedule.plantId
                ),
                Option.filter((p) => p.diedAt === null && inScope(scope)(p)),
                Option.flatMap((plant) =>
                  pipe(
                    Option.some(schedule.nextCareAt),
                    Option.filter((dueAt) =>
                      Option.match(prune, {
                        onNone: () => true,
                        onSome: ({ day, undatedBefore }) =>
                          schedule.dueDay === null
                            ? dueAt < undatedBefore
                            : schedule.dueDay <= day,
                      })
                    ),
                    Option.map((dueAt): ScheduledCare => {
                      const owner = ownerOf(plant)
                      const ownerId =
                        owner._tag === 'User' ? owner.userId : owner.canopyId
                      const careTimezone = data.timezones?.[ownerId] ?? 'UTC'
                      return {
                        careType: schedule.careType,
                        frequencyDays: schedule.frequencyDays,
                        dueAt,
                        dueDay: storedDay(schedule.dueDay, dueAt, careTimezone),
                        careTimezone,
                        plant: {
                          id: plant.id,
                          name: plant.name,
                          imageUrl: plant.imageUrl,
                          owner,
                          remindersEnabled: plant.remindersEnabled,
                          dateAdded: plant.dateAdded,
                          room: pipe(
                            Array.findFirst(
                              data.rooms ?? [],
                              (r) => r.id === plant.roomId
                            ),
                            Option.getOrNull
                          ),
                          sharedBy: null,
                        },
                      }
                    })
                  )
                )
              )
            )
          )
        ),
        (scheduled) => implied(scope, scheduled)
      )
    )
  )
}
