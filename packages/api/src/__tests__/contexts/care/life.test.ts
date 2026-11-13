import {
  createTestCareLine,
  createTestCarePlant,
  TEST_CARE_TODAY,
} from '@lily/api/__tests__/fixtures/care-plants'
import { ownerHeld } from '@lily/api/__tests__/mocks/care'
import {
  type CarePlant,
  Frequency,
  LifeState,
  type PlantDraft,
} from '@lily/api/contexts/care/domain/care-plant'
import {
  CareWrite,
  type Decision,
  type Refusal,
} from '@lily/api/contexts/care/domain/decide'
import {
  bury,
  type LifeCommand,
  OwnerRoom,
  plantNew,
  remove,
  restartedDueDay,
  revive,
} from '@lily/api/contexts/care/domain/life'
import {
  CanopyId,
  CareDay,
  LimitExceededError,
  type PlantOwner,
} from '@lily/shared'
import { Array, DateTime, Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

const today = CareDay.make('2026-11-12')
const alex: PlantOwner = { _tag: 'User', userId: 'alex' }

const draft: PlantDraft = {
  name: 'Fern',
  description: Option.none(),
  category: Option.none(),
  imageUrl: Option.none(),
  humidityRating: 3,
  lightingRating: 3,
  petToxicityRating: 1,
  wateringRating: 3,
  potWidthCm: Option.none(),
  potHeightCm: Option.none(),
  roomId: Option.none(),
}

describe('plantNew', () => {
  const planted = plantNew({
    plantId: 'fern',
    owner: alex,
    by: 'lily',
    draft,
    frequencies: [
      ['watering', Option.some(Frequency.make(7))],
      ['misting', Option.none()],
      ['repotting', Option.some(Frequency.make(180))],
    ],
    timezone: 'Pacific/Kiritimati',
    today,
  })

  it('writes the plant before its schedules, each starting and due today', () => {
    expect(planted.writes).toEqual([
      CareWrite.InsertPlant({
        plantId: 'fern',
        owner: alex,
        createdBy: 'lily',
        draft,
      }),
      CareWrite.PutSchedule({
        plantId: 'fern',
        careType: 'watering',
        schedule: {
          frequency: Frequency.make(7),
          startedOn: today,
          dueDay: today,
        },
        timezone: 'Pacific/Kiritimati',
      }),
      CareWrite.PutSchedule({
        plantId: 'fern',
        careType: 'repotting',
        schedule: {
          frequency: Frequency.make(180),
          startedOn: today,
          dueDay: today,
        },
        timezone: 'Pacific/Kiritimati',
      }),
    ])
  })

  it('says who planted it and which schedules it created', () => {
    expect(planted.events).toEqual([
      {
        _tag: 'PlantLifeChanged',
        plantId: 'fern',
        owner: alex,
        life: 'Planted',
        by: 'lily',
      },
      {
        _tag: 'ScheduleChanged',
        plantId: 'fern',
        careType: 'watering',
        dueDay: today,
        reason: 'created',
      },
      {
        _tag: 'ScheduleChanged',
        plantId: 'fern',
        careType: 'repotting',
        dueDay: today,
        reason: 'created',
      },
    ])
  })

  it('answers with the id of the new plant', () => {
    expect(planted.outcome).toEqual({ plantId: 'fern' })
  })
})

const lily = Option.some('lily')
const at = DateTime.makeUnsafe('2026-11-12T09:00:00Z')
const home: PlantOwner = { _tag: 'Canopy', canopyId: CanopyId.make('home') }
const full = new LimitExceededError({
  feature: 'plants',
  limit: 5,
  current: 5,
  message: 'Plant limit reached',
})

const living = (overrides: Parameters<typeof createTestCarePlant>[1] = {}) =>
  Option.some(createTestCarePlant('fern', { owner: alex, ...overrides }))
const dead = (overrides: Parameters<typeof createTestCarePlant>[1] = {}) =>
  living({ life: LifeState.Dead(), ...overrides })

const buried = (plant: Option.Option<CarePlant>, seenOwner = alex) =>
  bury(plant, 'fern', {
    seenOwner,
    by: lily,
    at,
    cause: 'pests',
    note: Option.some('aphids'),
  })
const revived = (
  plant: Option.Option<CarePlant>,
  room: OwnerRoom = OwnerRoom.Room(),
  owner = alex
) => revive(plant, 'fern', { held: ownerHeld(owner), by: lily, room })
const removed = (plant: Option.Option<CarePlant>, seenOwner = alex) =>
  remove(plant, 'fern', { seenOwner, by: lily })

const said = (decided: Result.Result<Decision<void>, Refusal>) =>
  Result.match(decided, {
    onFailure: (refusal) => refusal._tag,
    onSuccess: ({ events }) =>
      Array.flatMap(events, (event) =>
        event._tag === 'PlantLifeChanged' ? [event.life] : []
      ).join(),
  })

describe('what each command does to a plant in each life state', () => {
  const run = {
    Bury: buried,
    Revive: revived,
    Remove: removed,
  } satisfies Record<
    LifeCommand,
    (plant: Option.Option<CarePlant>) => Result.Result<Decision<void>, Refusal>
  >

  it.each([
    ['Bury', 'Living', 'Buried'],
    ['Bury', 'Dead', 'AlreadyDead'],
    ['Revive', 'Living', 'NotDead'],
    ['Revive', 'Dead', 'Revived'],
    ['Remove', 'Living', 'Removed'],
    ['Remove', 'Dead', 'Removed'],
  ] as const)('%s on a %s plant: %s', (command, state, outcome) => {
    expect(said(run[command](state === 'Living' ? living() : dead()))).toBe(
      outcome
    )
  })
})

describe('a plant that is gone', () => {
  it.each([
    ['bury', buried],
    ['revive', revived],
    ['remove', removed],
  ] as const)('refuses to %s a plant with no row', (_, command) => {
    expect(command(Option.none())).toEqual(
      Result.fail({ _tag: 'PlantGone', plantId: 'fern' })
    )
  })

  it('refuses to bury a plant that left the owner the caller saw, before it looks at its life', () => {
    expect(said(buried(dead({ owner: home })))).toBe('PlantGone')
  })

  it('refuses to revive a plant that left the owner the caller holds, before it looks at its life or the limit', () => {
    expect(
      said(revived(living({ owner: home }), OwnerRoom.Full({ error: full })))
    ).toBe('PlantGone')
  })

  it('refuses to remove a plant that left the owner the caller saw', () => {
    expect(said(removed(living({ owner: home })))).toBe('PlantGone')
  })
})

describe('bury', () => {
  it('writes the death and nothing else, so the schedules stay', () => {
    expect(Result.getOrThrow(buried(living())).writes).toEqual([
      CareWrite.BuryPlant({
        plantId: 'fern',
        at,
        cause: 'pests',
        note: Option.some('aphids'),
      }),
    ])
  })

  it('says who buried it', () => {
    expect(Result.getOrThrow(buried(living())).events).toEqual([
      {
        _tag: 'PlantLifeChanged',
        plantId: 'fern',
        owner: alex,
        life: 'Buried',
        by: 'lily',
      },
    ])
  })
})

describe('restartedDueDay', () => {
  it.each([
    ['2026-11-12', 7, '2026-11-19'],
    ['2026-01-28', 7, '2026-02-04'],
    ['2026-12-30', 3, '2027-01-02'],
    ['2028-02-28', 2, '2028-03-01'],
  ])('%s restarted every %i days is due %s', (from, days, due) => {
    expect(restartedDueDay(CareDay.make(from), Frequency.make(days))).toBe(due)
  })
})

describe('revive', () => {
  const overdueAndFarAhead = dead({
    lines: [
      createTestCareLine('watering', { dueDay: '2026-01-03' }),
      createTestCareLine('repotting', { dueDay: '2027-06-01' }),
      { careType: 'misting', schedule: Option.none(), history: [] },
    ],
  })

  it('refuses a living plant before a full owner', () => {
    expect(said(revived(living(), OwnerRoom.Full({ error: full })))).toBe(
      'NotDead'
    )
  })

  it('refuses a full owner with the error the limit gave', () => {
    expect(revived(dead(), OwnerRoom.Full({ error: full }))).toEqual(
      Result.fail({ _tag: 'OwnerFull', error: full })
    )
  })

  it('brings the plant back, then restarts each schedule at today plus its frequency', () => {
    const restarted = (careType: 'watering' | 'repotting') =>
      CareWrite.PutSchedule({
        plantId: 'fern',
        careType,
        schedule: {
          frequency: Frequency.make(7),
          startedOn: CareDay.make('2026-10-01'),
          dueDay: CareDay.make('2026-11-19'),
        },
        timezone: 'UTC',
      })

    expect(TEST_CARE_TODAY).toBe('2026-11-12')
    expect(Result.getOrThrow(revived(overdueAndFarAhead)).writes).toEqual([
      CareWrite.RevivePlant({ plantId: 'fern' }),
      restarted('watering'),
      restarted('repotting'),
    ])
  })

  it('says who revived it and which due days it restarted', () => {
    expect(Result.getOrThrow(revived(overdueAndFarAhead)).events).toEqual([
      {
        _tag: 'PlantLifeChanged',
        plantId: 'fern',
        owner: alex,
        life: 'Revived',
        by: 'lily',
      },
      {
        _tag: 'ScheduleChanged',
        plantId: 'fern',
        careType: 'watering',
        dueDay: '2026-11-19',
        reason: 'revived',
      },
      {
        _tag: 'ScheduleChanged',
        plantId: 'fern',
        careType: 'repotting',
        dueDay: '2026-11-19',
        reason: 'revived',
      },
    ])
  })
})

describe('remove', () => {
  it('deletes the plant and says who removed it', () => {
    const decided = Result.getOrThrow(removed(dead()))

    expect(decided.writes).toEqual([CareWrite.DeletePlant({ plantId: 'fern' })])
    expect(decided.events).toEqual([
      {
        _tag: 'PlantLifeChanged',
        plantId: 'fern',
        owner: alex,
        life: 'Removed',
        by: 'lily',
      },
    ])
  })

  it('names no user when a job removes it', () => {
    const decided = Result.getOrThrow(
      remove(living(), 'fern', { seenOwner: alex, by: Option.none() })
    )

    expect(decided.events).toMatchObject([{ life: 'Removed', by: null }])
  })
})
