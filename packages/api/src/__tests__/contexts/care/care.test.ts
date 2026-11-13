import { carePermit, createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import {
  Care,
  CareWhen,
  type DueDayMove,
  DueMove,
  PlanStepChoice,
} from '@lily/api/contexts/care'
import {
  type CareLine,
  type CarePlant,
  Frequency,
  PlantLife,
} from '@lily/api/contexts/care/domain/care-plant'
import type { AmendInput } from '@lily/api/contexts/care/domain/decide'
import { Actor, mintPermit } from '@lily/api/kernel/permit'
import { CareDay, CareDays, type CareType } from '@lily/shared'
import { Array, DateTime, Effect, Option, pipe } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const today = CareDay.make('2026-11-12')

const watering = (history: ReadonlyArray<string> = []): CareLine => ({
  careType: 'watering',
  schedule: Option.some({
    frequency: Frequency.make(7),
    dueDay: CareDay.make('2026-11-10'),
    startedOn: CareDay.make('2026-10-01'),
  }),
  history: Array.map(history, (day, i) => ({
    id: `care-${i}`,
    day: CareDay.make(day),
  })),
})

const plant = (id: string, overrides: Partial<CarePlant> = {}): CarePlant => ({
  id,
  owner: { _tag: 'User', userId: 'user-1' },
  life: PlantLife.Living(),
  timezone: 'UTC',
  today,
  needsAttention: false,
  lines: new Map([['watering', watering()]]),
  openPlanSteps: [],
  ...overrides,
})

const waterToday = {
  careType: 'watering' as const,
  on: CareWhen.Today(),
  notes: Option.none(),
  photoUrl: Option.none(),
  planStep: PlanStepChoice.Auto(),
}

type World = ReturnType<typeof createInMemoryCare>

const dueDayOf = (plants: ReadonlyMap<string, CarePlant>, id: string) =>
  pipe(
    Option.fromNullishOr(plants.get(id)),
    Option.flatMap((p) => Option.fromNullishOr(p.lines.get('watering'))),
    Option.flatMap((line) => line.schedule),
    Option.map((schedule) => schedule.dueDay),
    Option.getOrNull
  )

describe('Care', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(DateTime.toDateUtc(CareDays.startOf(today, 'UTC')))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('recordOne', () => {
    it('records the care, moves the due day and tells other contexts', async () => {
      const world = createInMemoryCare([plant('plant-1')])

      const recorded = await Effect.runPromise(
        Effect.flatMap(Care, (care) =>
          care.recordOne({ ...waterToday, permit: carePermit('plant-1') })
        ).pipe(Effect.provide(world.layer))
      )

      expect(recorded.day).toBe('2026-11-12')
      expect(dueDayOf(world.plants, 'plant-1')).toBe('2026-11-19')
      expect(world.events).toEqual([
        expect.objectContaining({
          _tag: 'CareRecorded',
          plantId: 'plant-1',
          careLogId: recorded.careLogId,
          by: 'user-1',
        }),
        expect.objectContaining({
          _tag: 'ScheduleChanged',
          dueDay: '2026-11-19',
          reason: 'care',
        }),
      ])
    })

    it.each([
      [
        'a second care on the same day',
        plant('plant-1', {
          lines: new Map([['watering', watering(['2026-11-12'])]]),
        }),
        'AlreadyCaredTodayError',
      ],
      [
        'a dead plant',
        plant('plant-1', { life: PlantLife.Dead() }),
        'PlantIsDeadError',
      ],
    ])('refuses %s and writes nothing', async (_name, state, error) => {
      const world = createInMemoryCare([state])

      const failure = await Effect.runPromise(
        Effect.flatMap(Care, (care) =>
          care.recordOne({ ...waterToday, permit: carePermit('plant-1') })
        ).pipe(Effect.flip, Effect.provide(world.layer))
      )

      expect(failure._tag).toBe(error)
      expect(world.writes).toEqual([])
      expect(world.events).toEqual([])
    })

    it('refuses a care day after today', async () => {
      const world = createInMemoryCare([plant('plant-1')])

      const failure = await Effect.runPromise(
        Effect.flatMap(Care, (care) =>
          care.recordOne({
            ...waterToday,
            on: CareWhen.Day({ day: CareDays.addDays(today, 1) }),
            permit: carePermit('plant-1'),
          })
        ).pipe(Effect.flip, Effect.provide(world.layer))
      )

      expect(failure._tag).toBe('FutureDateNotAllowedError')
    })

    it('answers not found for a plant deleted since the permit', async () => {
      const world = createInMemoryCare([])

      const failure = await Effect.runPromise(
        Effect.flatMap(Care, (care) =>
          care.recordOne({ ...waterToday, permit: carePermit('gone') })
        ).pipe(Effect.flip, Effect.provide(world.layer))
      )

      expect(failure).toMatchObject({
        _tag: 'PlantNotFoundError',
        plantId: 'gone',
      })
    })

    it('uses weather advice for a watering done today only', async () => {
      const world = createInMemoryCare([plant('today'), plant('yesterday')], {
        wateringDays: { today: 3, yesterday: 3 },
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          const care = yield* Care
          yield* care.recordOne({ ...waterToday, permit: carePermit('today') })
          yield* care.recordOne({
            ...waterToday,
            on: CareWhen.Day({ day: CareDays.addDays(today, -1) }),
            permit: carePermit('yesterday'),
          })
        }).pipe(Effect.provide(world.layer))
      )

      expect(dueDayOf(world.plants, 'today')).toBe('2026-11-15')
      expect(dueDayOf(world.plants, 'yesterday')).toBe('2026-11-18')
    })

    it('records a system care without a carer', async () => {
      const world = createInMemoryCare([plant('plant-1')])

      await Effect.runPromise(
        Effect.flatMap(Care, (care) =>
          care.recordOne({
            ...waterToday,
            permit: mintPermit(
              'plant-1',
              'care',
              Actor.System({ job: 'import' })
            ),
          })
        ).pipe(Effect.provide(world.layer))
      )

      expect(world.events[0]).toMatchObject({ _tag: 'CareRecorded', by: null })
    })
  })

  describe('record', () => {
    it('skips the plants that refuse and records the others', async () => {
      const world = createInMemoryCare([
        plant('a-fresh'),
        plant('b-cared', {
          lines: new Map([['watering', watering(['2026-11-12'])]]),
        }),
        plant('c-dead', { life: PlantLife.Dead() }),
      ])

      const outcomes = await Effect.runPromise(
        Effect.flatMap(Care, (care) =>
          care.record({
            ...waterToday,
            permits: Array.map(
              ['c-dead', 'gone', 'a-fresh', 'b-cared', 'a-fresh'],
              (id) => carePermit(id)
            ),
          })
        ).pipe(Effect.provide(world.layer))
      )

      expect(
        Array.map(outcomes, (outcome) => [
          outcome.plantId,
          outcome._tag === 'Skipped' ? outcome.reason._tag : outcome._tag,
        ])
      ).toEqual([
        ['a-fresh', 'Recorded'],
        ['b-cared', 'AlreadyCared'],
        ['c-dead', 'Dead'],
        ['gone', 'PlantGone'],
      ])
      expect(
        Array.filter(world.events, (event) => event._tag === 'CareRecorded')
      ).toHaveLength(1)
      expect(dueDayOf(world.plants, 'a-fresh')).toBe('2026-11-19')
      expect(dueDayOf(world.plants, 'b-cared')).toBe('2026-11-10')
    })

    it('does nothing without a permit', async () => {
      const world = createInMemoryCare([plant('plant-1')])

      const outcomes = await Effect.runPromise(
        Effect.flatMap(Care, (care) =>
          care.record({ ...waterToday, permits: [] })
        ).pipe(Effect.provide(world.layer))
      )

      expect(outcomes).toEqual([])
      expect(world.writes).toEqual([])
    })
  })

  const day = (value: string) => CareWhen.Day({ day: CareDay.make(value) })
  const tags = (items: ReadonlyArray<{ readonly _tag: string }>) =>
    Array.map(items, (item) => item._tag)
  const historyOf = (world: World, id: string) =>
    Array.map(
      world.plants.get(id)?.lines.get('watering')?.history ?? [],
      (entry) => entry.day
    )
  const caredTwice = (overrides: Partial<CarePlant> = {}) =>
    plant('plant-1', {
      lines: new Map([['watering', watering(['2026-11-05', '2026-11-01'])]]),
      ...overrides,
    })

  describe('amend', () => {
    const amend = (
      world: World,
      careLogId: string,
      change: Partial<AmendInput> = {},
      plantId = 'plant-1'
    ) =>
      Effect.flatMap(Care, (care) =>
        care.amend({
          permit: carePermit(plantId),
          careLogId,
          on: Option.none(),
          notes: Option.none(),
          photoUrl: Option.none(),
          ...change,
        })
      ).pipe(Effect.provide(world.layer))

    it('keeps the due day when only the notes change', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(
        amend(world, 'care-0', { notes: Option.some(Option.some('Soaked')) })
      )

      expect(dueDayOf(world.plants, 'plant-1')).toBe('2026-11-10')
      expect(tags(world.writes)).toEqual(['ReplaceCare'])
      expect(tags(world.events)).toEqual(['CareAmended'])
    })

    it('moves the due day with the latest care', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(
        amend(world, 'care-0', { on: Option.some(day('2026-11-08')) })
      )

      expect(historyOf(world, 'plant-1')).toEqual(['2026-11-08', '2026-11-01'])
      expect(dueDayOf(world.plants, 'plant-1')).toBe('2026-11-15')
      expect(tags(world.events)).toEqual(['CareAmended', 'ScheduleChanged'])
    })

    it('keeps the due day when an older care moves', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(
        amend(world, 'care-1', { on: Option.some(day('2026-11-02')) })
      )

      expect(historyOf(world, 'plant-1')).toEqual(['2026-11-05', '2026-11-02'])
      expect(dueDayOf(world.plants, 'plant-1')).toBe('2026-11-10')
    })

    it('edits a care of a dead plant', async () => {
      const world = createInMemoryCare([caredTwice({ life: PlantLife.Dead() })])

      await Effect.runPromise(
        amend(world, 'care-0', { notes: Option.some(Option.none()) })
      )

      expect(tags(world.writes)).toEqual(['ReplaceCare'])
    })

    it('edits a care that shares its day with another', async () => {
      const world = createInMemoryCare([
        plant('plant-1', {
          lines: new Map([
            ['watering', watering(['2026-11-05', '2026-11-05'])],
          ]),
        }),
      ])

      await Effect.runPromise(
        amend(world, 'care-1', { notes: Option.some(Option.some('Twice')) })
      )

      expect(tags(world.writes)).toEqual(['ReplaceCare'])
    })

    it.each([
      [
        'a move onto a day that already has a care',
        'care-1',
        { on: Option.some(day('2026-11-05')) },
        'plant-1',
        'AlreadyCaredTodayError',
      ],
      [
        'a move to a day after today',
        'care-0',
        { on: Option.some(day('2026-11-13')) },
        'plant-1',
        'FutureDateNotAllowedError',
      ],
      [
        'a care of another plant',
        'care-0',
        {},
        'plant-2',
        'CareLogNotFoundError',
      ],
      [
        'a care that does not exist',
        'nope',
        {},
        'plant-1',
        'CareLogNotFoundError',
      ],
    ])(
      'refuses %s and writes nothing',
      async (_name, careLogId, change, plantId, error) => {
        const world = createInMemoryCare([
          caredTwice(),
          plant('plant-2', { lines: new Map() }),
        ])

        const failure = await Effect.runPromise(
          Effect.flip(amend(world, careLogId, change, plantId))
        )

        expect(failure._tag).toBe(error)
        expect(world.writes).toEqual([])
        expect(world.events).toEqual([])
      }
    )
  })

  describe('remove', () => {
    const remove = (world: World, careLogId: string) =>
      Effect.flatMap(Care, (care) =>
        care.remove({ permit: carePermit('plant-1'), careLogId })
      ).pipe(Effect.provide(world.layer))

    it('counts the due day from the care before the removed one', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(remove(world, 'care-0'))

      expect(historyOf(world, 'plant-1')).toEqual(['2026-11-01'])
      expect(dueDayOf(world.plants, 'plant-1')).toBe('2026-11-08')
      expect(tags(world.events)).toEqual(['CareRemoved', 'ScheduleChanged'])
    })

    it('keeps the due day when an older care is removed', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(remove(world, 'care-1'))

      expect(historyOf(world, 'plant-1')).toEqual(['2026-11-05'])
      expect(dueDayOf(world.plants, 'plant-1')).toBe('2026-11-10')
      expect(tags(world.events)).toEqual(['CareRemoved'])
    })

    it('counts the due day from the schedule start once no care is left', async () => {
      const world = createInMemoryCare([
        plant('plant-1', {
          lines: new Map([['watering', watering(['2026-11-05'])]]),
        }),
      ])

      await Effect.runPromise(remove(world, 'care-0'))

      expect(dueDayOf(world.plants, 'plant-1')).toBe('2026-10-01')
    })

    it('refuses a care that does not exist', async () => {
      const world = createInMemoryCare([caredTwice()])

      const failure = await Effect.runPromise(
        Effect.flip(remove(world, 'nope'))
      )

      expect(failure._tag).toBe('CareLogNotFoundError')
      expect(world.writes).toEqual([])
    })
  })

  describe('correctLastCare', () => {
    const fertilization: CareLine = {
      careType: 'fertilization',
      schedule: Option.some({
        frequency: Frequency.make(30),
        dueDay: CareDay.make('2026-11-20'),
        startedOn: CareDay.make('2026-10-01'),
      }),
      history: [{ id: 'feed-0', day: CareDay.make('2026-10-21') }],
    }
    const correct = (
      world: World,
      corrections: ReadonlyArray<{
        readonly careType: 'watering' | 'fertilization'
        readonly on: CareWhen
      }>
    ) =>
      Effect.flatMap(Care, (care) =>
        care.correctLastCare({ permit: carePermit('plant-1'), corrections })
      ).pipe(Effect.provide(world.layer))

    it('moves the latest care to the corrected day', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(
        correct(world, [{ careType: 'watering', on: day('2026-11-08') }])
      )

      expect(historyOf(world, 'plant-1')).toEqual(['2026-11-08', '2026-11-01'])
      expect(dueDayOf(world.plants, 'plant-1')).toBe('2026-11-15')
    })

    it('records a care when the plant has none', async () => {
      const world = createInMemoryCare([plant('plant-1')])

      await Effect.runPromise(
        correct(world, [{ careType: 'watering', on: day('2026-11-09') }])
      )

      expect(historyOf(world, 'plant-1')).toEqual(['2026-11-09'])
      expect(dueDayOf(world.plants, 'plant-1')).toBe('2026-11-16')
      expect(world.events).toEqual([
        expect.objectContaining({ _tag: 'CareRecorded', by: 'user-1' }),
        expect.objectContaining({ _tag: 'ScheduleChanged' }),
      ])
    })

    it('uses the weather advice for a watering corrected to today', async () => {
      const world = createInMemoryCare([caredTwice()], {
        wateringDays: { 'plant-1': 9 },
      })

      await Effect.runPromise(
        correct(world, [{ careType: 'watering', on: CareWhen.Today() }])
      )

      expect(dueDayOf(world.plants, 'plant-1')).toBe('2026-11-21')
    })

    it('corrects several care types together or none of them', async () => {
      const both = () =>
        caredTwice({
          lines: new Map([
            ['watering', watering(['2026-11-05', '2026-11-01'])],
            ['fertilization', fertilization],
          ]),
        })
      const applied = createInMemoryCare([both()])
      const refused = createInMemoryCare([both()])

      await Effect.runPromise(
        correct(applied, [
          { careType: 'watering', on: day('2026-11-08') },
          { careType: 'fertilization', on: day('2026-11-02') },
        ])
      )
      const failure = await Effect.runPromise(
        Effect.flip(
          correct(refused, [
            { careType: 'watering', on: day('2026-11-08') },
            { careType: 'fertilization', on: day('2026-11-13') },
          ])
        )
      )

      expect(tags(applied.writes)).toEqual([
        'ReplaceCare',
        'PutSchedule',
        'ReplaceCare',
        'PutSchedule',
      ])
      expect(failure._tag).toBe('FutureDateNotAllowedError')
      expect(refused.writes).toEqual([])
    })

    it('refuses a dead plant', async () => {
      const world = createInMemoryCare([caredTwice({ life: PlantLife.Dead() })])

      const failure = await Effect.runPromise(
        Effect.flip(
          correct(world, [{ careType: 'watering', on: day('2026-11-08') }])
        )
      )

      expect(failure._tag).toBe('PlantIsDeadError')
      expect(world.writes).toEqual([])
    })

    it('does nothing without a correction', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(correct(world, []))

      expect(world.writes).toEqual([])
    })
  })

  const dueOf = (world: World, id: string, careType: CareType) =>
    pipe(
      Option.fromNullishOr(world.plants.get(id)?.lines.get(careType)),
      Option.flatMap((line) => line.schedule),
      Option.map((schedule) => schedule.dueDay),
      Option.getOrNull
    )

  describe('setSchedules', () => {
    const editPermit = mintPermit(
      'plant-1',
      'edit',
      Actor.User({ userId: 'user-1' })
    )
    const set = (
      world: World,
      frequencies: ReadonlyArray<readonly [CareType, Option.Option<number>]>
    ) =>
      Effect.flatMap(Care, (care) =>
        care.setSchedules({
          permit: editPermit,
          frequencies: Array.map(
            frequencies,
            ([careType, days]) =>
              [careType, Option.map(days, Frequency.make)] as const
          ),
        })
      ).pipe(Effect.provide(world.layer))
    const unscheduledFeeding: CareLine = {
      careType: 'fertilization',
      schedule: Option.none(),
      history: [{ id: 'feed-0', day: CareDay.make('2026-10-21') }],
    }

    it('starts a schedule due today for a care never done', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(set(world, [['misting', Option.some(3)]]))

      expect(dueOf(world, 'plant-1', 'misting')).toBe('2026-11-12')
      expect(world.events).toEqual([
        expect.objectContaining({
          _tag: 'ScheduleChanged',
          careType: 'misting',
          dueDay: '2026-11-12',
          reason: 'created',
        }),
      ])
    })

    it('counts a first schedule from the cares already done', async () => {
      const world = createInMemoryCare([
        caredTwice({ lines: new Map([['fertilization', unscheduledFeeding]]) }),
      ])

      await Effect.runPromise(set(world, [['fertilization', Option.some(30)]]))

      expect(dueOf(world, 'plant-1', 'fertilization')).toBe('2026-11-20')
    })

    it('counts a new frequency from the latest care', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(set(world, [['watering', Option.some(14)]]))

      expect(dueOf(world, 'plant-1', 'watering')).toBe('2026-11-19')
      expect(world.events).toEqual([
        expect.objectContaining({ dueDay: '2026-11-19', reason: 'frequency' }),
      ])
    })

    it('stops a schedule and says so', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(set(world, [['watering', Option.none()]]))

      expect(dueOf(world, 'plant-1', 'watering')).toBeNull()
      expect(tags(world.writes)).toEqual(['DropSchedule'])
      expect(world.events).toEqual([
        expect.objectContaining({ dueDay: null, reason: 'dropped' }),
      ])
    })

    it.each([
      ['a living plant', PlantLife.Living()],
      ['a dead plant', PlantLife.Dead()],
    ])(
      'changes nothing when %s already has what is asked',
      async (_name, life) => {
        const world = createInMemoryCare([caredTwice({ life })])

        await Effect.runPromise(
          set(world, [
            ['watering', Option.some(7)],
            ['misting', Option.none()],
          ])
        )

        expect(world.writes).toEqual([])
        expect(world.events).toEqual([])
      }
    )

    it.each([
      [
        'a dead plant',
        [caredTwice({ life: PlantLife.Dead() })],
        'PlantIsDeadError',
      ],
      ['a plant that is gone', [], 'PlantNotFoundError'],
    ])('refuses a change on %s', async (_name, plants, error) => {
      const world = createInMemoryCare(plants)

      const failure = await Effect.runPromise(
        Effect.flip(
          set(world, [
            ['misting', Option.some(3)],
            ['watering', Option.some(14)],
          ])
        )
      )

      expect(failure._tag).toBe(error)
      expect(world.writes).toEqual([])
    })
  })

  describe('moveDueDays', () => {
    const move = (
      world: World,
      moves: ReadonlyArray<DueDayMove>,
      reason: 'carePlan' | 'weather' | 'vacation' = 'weather'
    ) =>
      Effect.flatMap(Care, (care) => care.moveDueDays({ reason, moves })).pipe(
        Effect.provide(world.layer)
      )
    const watering1 = (move: DueMove): DueDayMove => ({
      plantId: 'plant-1',
      careType: 'watering',
      move,
    })

    it('moves to the care day of an instant, counted in the plant timezone', async () => {
      const world = createInMemoryCare([
        caredTwice({ timezone: 'Pacific/Auckland' }),
      ])

      await Effect.runPromise(
        move(
          world,
          [
            watering1(
              DueMove.To({
                instant: DateTime.makeUnsafe('2026-11-20T20:00:00.000Z'),
              })
            ),
          ],
          'carePlan'
        )
      )

      expect(dueOf(world, 'plant-1', 'watering')).toBe('2026-11-21')
      expect(world.events).toEqual([
        expect.objectContaining({
          _tag: 'ScheduleChanged',
          dueDay: '2026-11-21',
          reason: 'carePlan',
        }),
      ])
    })

    it.each([
      [2, '2026-11-12'],
      [-1, '2026-11-09'],
    ])('moves by %i whole days', async (days, expected) => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(move(world, [watering1(DueMove.By({ days }))]))

      expect(dueOf(world, 'plant-1', 'watering')).toBe(expected)
    })

    const MORNING = '2026-11-12T10:00:00.000Z'
    const MIDNIGHT = '2026-11-12T00:00:00.000Z'
    it.each([
      ['by the days away', '2026-11-10', 5, MORNING, '2026-11-15'],
      ['no earlier than the day after', '2026-11-10', 1, MORNING, '2026-11-13'],
      ['when due on the day it ended', '2026-11-12', 1, MORNING, '2026-11-13'],
      ['not at all when due later', '2026-11-14', 5, MORNING, '2026-11-14'],
      [
        'when due the eve of a midnight return',
        '2026-11-11',
        5,
        MIDNIGHT,
        '2026-11-16',
      ],
      [
        'not at all when due the day of a midnight return',
        '2026-11-12',
        5,
        MIDNIGHT,
        '2026-11-12',
      ],
    ])(
      'moves a due day after an absence %s',
      async (_name, dueDay, days, endedAt, expected) => {
        const line = watering(['2026-11-05'])
        const world = createInMemoryCare([
          plant('plant-1', {
            lines: new Map([
              [
                'watering',
                {
                  ...line,
                  schedule: Option.map(line.schedule, (schedule) => ({
                    ...schedule,
                    dueDay: CareDay.make(dueDay),
                  })),
                },
              ],
            ]),
          }),
        ])

        await Effect.runPromise(
          move(
            world,
            [
              watering1(
                DueMove.AfterAbsence({
                  endedAt: DateTime.makeUnsafe(endedAt),
                  days,
                })
              ),
            ],
            'vacation'
          )
        )

        expect(dueOf(world, 'plant-1', 'watering')).toBe(expected)
      }
    )

    it('keeps a moved due day when an older care is edited', async () => {
      const world = createInMemoryCare([caredTwice()])

      await Effect.runPromise(
        move(world, [watering1(DueMove.By({ days: 3 }))]).pipe(
          Effect.andThen(
            Effect.flatMap(Care, (care) =>
              care.amend({
                permit: carePermit('plant-1'),
                careLogId: 'care-1',
                on: Option.some(day('2026-11-02')),
                notes: Option.none(),
                photoUrl: Option.none(),
              })
            ).pipe(Effect.provide(world.layer))
          )
        )
      )

      expect(dueOf(world, 'plant-1', 'watering')).toBe('2026-11-13')
    })

    it('leaves alone a dead plant, a missing plant, an unscheduled care and a move to the same day', async () => {
      const world = createInMemoryCare([
        caredTwice(),
        plant('dead', { life: PlantLife.Dead() }),
      ])

      await Effect.runPromise(
        move(world, [
          {
            plantId: 'dead',
            careType: 'watering',
            move: DueMove.By({ days: 2 }),
          },
          {
            plantId: 'gone',
            careType: 'watering',
            move: DueMove.By({ days: 2 }),
          },
          {
            plantId: 'plant-1',
            careType: 'misting',
            move: DueMove.By({ days: 2 }),
          },
          watering1(DueMove.By({ days: 0 })),
        ])
      )

      expect(world.writes).toEqual([])
      expect(world.events).toEqual([])
    })
  })
})
