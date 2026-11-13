import type { CareEvent } from '@lily/api/contexts/care'
import { Dirty } from '@lily/api/contexts/reminders/store'
import { Match } from 'effect'

const plant = (plantId: string): ReadonlyArray<Dirty> => [
  Dirty.Plants({ plantIds: [plantId] }),
]

const saidByScheduleChanged: ReadonlyArray<Dirty> = []

/**
 * What a Care event may have made stale. The event only names the plant: the
 * replan reads current state, so a redelivered or reordered event converges
 * on the same reminders. A new Care event does not compile until it has an
 * arm here.
 */
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
