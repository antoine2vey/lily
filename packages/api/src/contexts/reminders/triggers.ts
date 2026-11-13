import type { AbsenceEvent } from '@lily/api/contexts/absence'
import type { CanopyEvent } from '@lily/api/contexts/canopy'
import type { CareEvent } from '@lily/api/contexts/care'
import { Dirty } from '@lily/api/contexts/reminders/store'
import { Match } from 'effect'

const plant = (plantId: string): ReadonlyArray<Dirty> => [
  Dirty.Plants({ plantIds: [plantId] }),
]

const plants = (plantIds: ReadonlyArray<string>): ReadonlyArray<Dirty> => [
  Dirty.Plants({ plantIds }),
]

const recipient = (userId: string): ReadonlyArray<Dirty> => [
  Dirty.Recipient({ userId }),
]

const saidByScheduleChanged: ReadonlyArray<Dirty> = []

const saidByPlantsMoved: ReadonlyArray<Dirty> = []

export const staleAfterCare: (event: CareEvent) => ReadonlyArray<Dirty> =
  Match.type<CareEvent>().pipe(
    Match.tagsExhaustive({
      ScheduleChanged: ({ plantId }) => plant(plantId),
      CareRecorded: ({ plantId }) => plant(plantId),
      CareAmended: () => saidByScheduleChanged,
      CareRemoved: () => saidByScheduleChanged,
      PlantLifeChanged: ({ plantId }) => plant(plantId),
    })
  )

export const staleAfterCanopy: (event: CanopyEvent) => ReadonlyArray<Dirty> =
  Match.type<CanopyEvent>().pipe(
    Match.tagsExhaustive({
      MemberJoined: ({ userId }) => recipient(userId),
      MemberLeft: ({ userId }) => recipient(userId),
      PlantsMoved: ({ plantIds }) => plants(plantIds),
      CanopyTimezoneChanged: ({ canopyId }) => [Dirty.Canopy({ canopyId })],
      PlantMuted: ({ plantId }) => plant(plantId),
      PlantUnmuted: ({ plantId }) => plant(plantId),
      CanopyDissolved: () => saidByPlantsMoved,
    })
  )

export const staleAfterAbsence: (event: AbsenceEvent) => ReadonlyArray<Dirty> =
  Match.type<AbsenceEvent>().pipe(
    Match.tagsExhaustive({
      DelegationStarted: ({ plantIds }) => plants(plantIds),
      DelegationEnded: ({ plantIds }) => plants(plantIds),
      VacationStarted: ({ userId }) => recipient(userId),
      VacationEnded: ({ userId }) => recipient(userId),
    })
  )
