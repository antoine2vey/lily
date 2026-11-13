import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import type { AbsenceEvent } from '@lily/api/contexts/absence'
import type { CanopyEvent } from '@lily/api/contexts/canopy'
import type { CareEvent } from '@lily/api/contexts/care'
import { Dirty } from '@lily/api/contexts/reminders/store'
import {
  staleAfterAbsence,
  staleAfterCanopy,
  staleAfterCare,
} from '@lily/api/contexts/reminders/triggers'
import { CareDay } from '@lily/shared'
import { Struct } from 'effect'
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

const home = { _tag: 'Canopy', canopyId: mockCanopyId } as const
const lily = [Dirty.Recipient({ userId: 'lily' })]

const canopyCases: ReadonlyArray<readonly [CanopyEvent, ReadonlyArray<Dirty>]> =
  [
    [{ _tag: 'MemberJoined', canopyId: 'canopy-1', userId: 'lily' }, lily],
    [
      {
        _tag: 'MemberLeft',
        canopyId: 'canopy-1',
        userId: 'lily',
        reason: 'removed',
      },
      lily,
    ],
    [
      {
        _tag: 'PlantsMoved',
        plantIds: ['plant-1', 'plant-2'],
        from: home,
        to: owner,
      },
      [Dirty.Plants({ plantIds: ['plant-1', 'plant-2'] })],
    ],
    [
      { _tag: 'CanopyTimezoneChanged', canopyId: 'canopy-1' },
      [Dirty.Canopy({ canopyId: 'canopy-1' })],
    ],
    [{ _tag: 'PlantMuted', plantId: 'plant-1', userId: 'lily' }, thePlant],
    [{ _tag: 'PlantUnmuted', plantId: 'plant-1', userId: 'lily' }, thePlant],
    [{ _tag: 'CanopyDissolved', canopyId: 'canopy-1' }, []],
  ]

describe('staleAfterCanopy', () => {
  it.each(
    canopyCases.map(([event, stale]) => ({ tag: event._tag, event, stale }))
  )('$tag names what to replan', ({ event, stale }) => {
    expect(staleAfterCanopy(event)).toEqual(stale)
  })
})

const handedOver = {
  delegationId: 'delegation-1',
  ownerId: 'alex',
  caretakerId: 'lily',
  plantIds: ['plant-1', 'plant-2'],
}

const absenceCases: {
  readonly [T in AbsenceEvent['_tag']]: readonly [
    Extract<AbsenceEvent, { readonly _tag: T }>,
    ReadonlyArray<Dirty>,
  ]
} = {
  DelegationStarted: [
    { _tag: 'DelegationStarted', ...handedOver },
    [Dirty.Plants({ plantIds: ['plant-1', 'plant-2'] })],
  ],
  DelegationEnded: [
    { _tag: 'DelegationEnded', ...handedOver, reason: 'completed' },
    [Dirty.Plants({ plantIds: ['plant-1', 'plant-2'] })],
  ],
  VacationStarted: [
    { _tag: 'VacationStarted', userId: 'alex' },
    [Dirty.Recipient({ userId: 'alex' })],
  ],
  VacationEnded: [
    {
      _tag: 'VacationEnded',
      userId: 'alex',
      start: new Date('2026-08-09T22:30:00.000Z'),
      endedAt: new Date('2026-08-17T06:00:00.000Z'),
    },
    [Dirty.Recipient({ userId: 'alex' })],
  ],
}

describe('staleAfterAbsence', () => {
  it.each(Struct.keys(absenceCases))('%s names what to replan', (tag) => {
    const [event, stale] = absenceCases[tag]

    expect(staleAfterAbsence(event)).toEqual(stale)
  })
})
