import type { CareEvent } from '@lily/api/contexts/care'
import { Dirty } from '@lily/api/contexts/reminders/store'
import { staleAfterCare } from '@lily/api/contexts/reminders/triggers'
import { CareDay } from '@lily/shared'
import { describe, expect, it } from 'vitest'

const owner = { _tag: 'User', userId: 'user-1' } as const
const day = CareDay.make('2026-03-10')
const thePlant = [Dirty.Plants({ plantIds: ['plant-1'] })]

const cases: ReadonlyArray<readonly [CareEvent, ReadonlyArray<Dirty>]> = [
  [
    {
      _tag: 'ScheduleChanged',
      plantId: 'plant-1',
      careType: 'watering',
      dueDay: day,
      reason: 'care',
    },
    thePlant,
  ],
  [
    {
      _tag: 'CareRecorded',
      plantId: 'plant-1',
      owner,
      careLogId: 'log-1',
      careType: 'watering',
      day,
      by: 'user-1',
      answeredAttention: true,
    },
    thePlant,
  ],
  [
    { _tag: 'PlantLifeChanged', plantId: 'plant-1', owner, life: 'Dead' },
    thePlant,
  ],
  [
    {
      _tag: 'CareAmended',
      plantId: 'plant-1',
      careLogId: 'log-1',
      careType: 'watering',
    },
    [],
  ],
  [
    {
      _tag: 'CareRemoved',
      plantId: 'plant-1',
      careLogId: 'log-1',
      careType: 'watering',
    },
    [],
  ],
]

describe('staleAfterCare', () => {
  it.each(cases.map(([event, stale]) => ({ tag: event._tag, event, stale })))(
    '$tag names what to replan',
    ({ event, stale }) => {
      expect(staleAfterCare(event)).toEqual(stale)
    }
  )
})
