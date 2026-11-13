import {
  type CareLine,
  type CarePlant,
  CareWhen,
  type DecideEnv,
  Frequency,
  type OpenPlanStep,
  PlanStepChoice,
  PlantLife,
} from '@lily/api/contexts/care/domain/care-plant'
import {
  amendCare,
  type CareWrite,
  correctLastCare,
  nextDueDay,
  type RecordInput,
  recordCare,
  recordCareOnAll,
  removeCare,
} from '@lily/api/contexts/care/domain/decide'
import { CareDay, CareDays, type CareType } from '@lily/shared'
import { Array, DateTime, Option, pipe, Result } from 'effect'
import { describe, expect, it } from 'vitest'

const day = (value: string) => CareDay.make(value)
const today = day('2026-11-12')
const now = DateTime.makeUnsafe('2026-11-12T09:00:00Z')

const line = (
  careType: CareType,
  options: {
    readonly frequency?: number
    readonly dueDay?: string
    readonly history?: ReadonlyArray<readonly [id: string, day: string]>
  } = {}
): CareLine => ({
  careType,
  schedule:
    options.frequency === undefined
      ? Option.none()
      : Option.some({
          frequency: Frequency.make(options.frequency),
          dueDay: day(options.dueDay ?? '2026-11-12'),
          startedOn: day('2026-10-01'),
        }),
  history: Array.map(options.history ?? [], ([id, d]) => ({ id, day: day(d) })),
})

const plant = (
  lines: ReadonlyArray<CareLine>,
  overrides: Partial<CarePlant> = {}
): CarePlant => ({
  id: 'plant-1',
  owner: { _tag: 'User', userId: 'user-1' },
  life: PlantLife.Living(),
  timezone: 'UTC',
  today,
  needsAttention: false,
  lines: new Map(Array.map(lines, (l) => [l.careType, l])),
  openPlanSteps: [],
  ...overrides,
})

const env = (overrides: Partial<DecideEnv> = {}): DecideEnv => ({
  now,
  newCareLogId: 'care-new',
  wateringDays: Option.none(),
  by: Option.some('user-1'),
  ...overrides,
})

const water = (overrides: Partial<RecordInput> = {}): RecordInput => ({
  careType: 'watering',
  on: CareWhen.Today(),
  notes: Option.none(),
  photoUrl: Option.none(),
  planStep: PlanStepChoice.Auto(),
  ...overrides,
})

const tags = (writes: ReadonlyArray<CareWrite>) =>
  Array.map(writes, (write) => write._tag)

const dueDayWritten = (writes: ReadonlyArray<CareWrite>) =>
  pipe(
    Array.findFirst(writes, (write) => write._tag === 'PutSchedule'),
    Option.map((write) => write.schedule.dueDay),
    Option.getOrNull
  )

const refusalOf = <A>(result: Result.Result<A, { readonly _tag: string }>) =>
  Result.match(result, {
    onSuccess: () => 'accepted',
    onFailure: (refusal) => refusal._tag,
  })

describe('nextDueDay', () => {
  it('is the latest care plus the frequency', () => {
    const watering = line('watering', {
      frequency: 7,
      history: [
        ['b', '2026-11-10'],
        ['a', '2026-11-01'],
      ],
    })
    expect(nextDueDay(watering, today, Option.none())).toEqual(
      Option.some('2026-11-17')
    )
  })

  it('is the day the schedule started when there is no care', () => {
    expect(
      nextDueDay(line('watering', { frequency: 7 }), today, Option.none())
    ).toEqual(Option.some('2026-10-01'))
  })

  it('uses weather days only for a watering done today', () => {
    const wateredToday = line('watering', {
      frequency: 7,
      history: [['a', '2026-11-12']],
    })
    const wateredYesterday = line('watering', {
      frequency: 7,
      history: [['a', '2026-11-11']],
    })
    const mistedToday = line('misting', {
      frequency: 7,
      history: [['a', '2026-11-12']],
    })
    const weather = Option.some(10)

    expect(nextDueDay(wateredToday, today, weather)).toEqual(
      Option.some('2026-11-22')
    )
    expect(nextDueDay(wateredYesterday, today, weather)).toEqual(
      Option.some('2026-11-18')
    )
    expect(nextDueDay(mistedToday, today, weather)).toEqual(
      Option.some('2026-11-19')
    )
  })

  it('has no due day without a schedule', () => {
    expect(nextDueDay(line('watering'), today, Option.none())).toEqual(
      Option.none()
    )
  })
})

describe('recordCare', () => {
  it('records the care and moves the due day', () => {
    const decided = pipe(
      recordCare(
        plant([line('watering', { frequency: 7, dueDay: '2026-11-10' })]),
        water(),
        env()
      ),
      Result.getOrThrow
    )

    expect(tags(decided.writes)).toEqual(['InsertCare', 'PutSchedule'])
    expect(dueDayWritten(decided.writes)).toBe('2026-11-19')
    expect(decided.outcome).toMatchObject({
      careLogId: 'care-new',
      day: '2026-11-12',
      dueDay: Option.some('2026-11-19'),
    })
    expect(Array.map(decided.events, (event) => event._tag)).toEqual([
      'CareRecorded',
      'ScheduleChanged',
    ])
  })

  it('refuses a second care of the same type on the same care day', () => {
    const cared = plant([
      line('watering', { frequency: 7, history: [['a', '2026-11-12']] }),
    ])

    expect(refusalOf(recordCare(cared, water(), env()))).toBe('AlreadyCared')
    expect(
      refusalOf(recordCare(cared, water({ careType: 'misting' }), env()))
    ).toBe('accepted')
  })

  it('counts the care day in the plant timezone, not in UTC', () => {
    const lateEvening = DateTime.makeUnsafe('2026-11-11T23:30:00Z')
    const paris = plant(
      [line('watering', { frequency: 7, history: [['a', '2026-11-11']] })],
      { timezone: 'Europe/Paris' }
    )

    const decided = pipe(
      recordCare(
        paris,
        water({ on: CareWhen.At({ instant: lateEvening }) }),
        env()
      ),
      Result.getOrThrow
    )

    expect(decided.outcome.day).toBe('2026-11-12')
  })

  it('refuses a care day after today and accepts a later time today', () => {
    const empty = plant([line('watering', { frequency: 7 })])
    const tomorrow = CareWhen.At({
      instant: DateTime.makeUnsafe('2026-11-13T00:30:00Z'),
    })
    const tonight = CareWhen.At({
      instant: DateTime.makeUnsafe('2026-11-12T23:30:00Z'),
    })

    expect(refusalOf(recordCare(empty, water({ on: tomorrow }), env()))).toBe(
      'FutureDay'
    )
    expect(refusalOf(recordCare(empty, water({ on: tonight }), env()))).toBe(
      'accepted'
    )
  })

  it('refuses a dead plant', () => {
    const dead = plant([line('watering', { frequency: 7 })], {
      life: PlantLife.Dead(),
    })
    expect(refusalOf(recordCare(dead, water(), env()))).toBe('Dead')
  })

  it('leaves the due day alone when an older care is back-filled', () => {
    const moved = plant([
      line('watering', {
        frequency: 7,
        dueDay: '2026-11-25',
        history: [['a', '2026-11-10']],
      }),
    ])

    const decided = pipe(
      recordCare(
        moved,
        water({ on: CareWhen.Day({ day: day('2026-11-03') }) }),
        env()
      ),
      Result.getOrThrow
    )

    expect(tags(decided.writes)).toEqual(['InsertCare'])
    expect(decided.outcome.dueDay).toEqual(Option.some('2026-11-25'))
    expect(Array.map(decided.events, (event) => event._tag)).toEqual([
      'CareRecorded',
    ])
  })

  it('records a care on a plant without a schedule', () => {
    const decided = pipe(
      recordCare(plant([]), water({ careType: 'repotting' }), env()),
      Result.getOrThrow
    )

    expect(tags(decided.writes)).toEqual(['InsertCare'])
    expect(decided.outcome.dueDay).toEqual(Option.none())
  })

  it('schedules the next watering from the weather when done today', () => {
    const decided = pipe(
      recordCare(
        plant([line('watering', { frequency: 7 })]),
        water(),
        env({ wateringDays: Option.some(4) })
      ),
      Result.getOrThrow
    )
    expect(dueDayWritten(decided.writes)).toBe('2026-11-16')
  })

  it('says whether the plant had an overdue care', () => {
    const decided = pipe(
      recordCare(
        plant([line('watering', { frequency: 7 })], { needsAttention: true }),
        water(),
        env()
      ),
      Result.getOrThrow
    )
    expect(decided.events[0]).toMatchObject({
      _tag: 'CareRecorded',
      answeredAttention: true,
      by: 'user-1',
    })
  })

  describe('care plan steps', () => {
    const step = (
      id: string,
      overrides: Partial<OpenPlanStep> = {}
    ): OpenPlanStep => ({
      id,
      planId: 'plan-1',
      planAccepted: true,
      careType: Option.some('watering'),
      ...overrides,
    })
    const withSteps = (openPlanSteps: ReadonlyArray<OpenPlanStep>) =>
      plant([line('watering', { frequency: 7 })], { openPlanSteps })

    it('completes the earliest open step of the care type', () => {
      const decided = pipe(
        recordCare(
          withSteps([
            step('misting-step', { careType: Option.some('misting') }),
            step('first'),
            step('second'),
          ]),
          water(),
          env()
        ),
        Result.getOrThrow
      )

      expect(decided.writes).toContainEqual(
        expect.objectContaining({
          _tag: 'CompletePlanStep',
          stepId: 'first',
          careLogId: 'care-new',
        })
      )
      expect(tags(decided.writes)).not.toContain('SettlePlan')
    })

    it('settles the plan when its last open step is completed', () => {
      const decided = pipe(
        recordCare(withSteps([step('only')]), water(), env()),
        Result.getOrThrow
      )
      expect(tags(decided.writes)).toEqual([
        'InsertCare',
        'CompletePlanStep',
        'SettlePlan',
        'PutSchedule',
      ])
    })

    it('ignores steps of a plan that is not accepted unless one is named', () => {
      const proposed = withSteps([step('proposed', { planAccepted: false })])

      const auto = pipe(recordCare(proposed, water(), env()), Result.getOrThrow)
      const named = pipe(
        recordCare(
          proposed,
          water({ planStep: PlanStepChoice.Step({ id: 'proposed' }) }),
          env()
        ),
        Result.getOrThrow
      )

      expect(tags(auto.writes)).not.toContain('CompletePlanStep')
      expect(tags(named.writes)).toContain('CompletePlanStep')
      expect(tags(named.writes)).not.toContain('SettlePlan')
    })
  })
})

describe('recordCareOnAll', () => {
  it('skips the plants that refuse and records the others', () => {
    const fresh = plant([line('watering', { frequency: 7 })], { id: 'fresh' })
    const cared = plant(
      [line('watering', { frequency: 7, history: [['a', '2026-11-12']] })],
      { id: 'cared' }
    )
    const dead = plant([line('watering', { frequency: 7 })], {
      id: 'dead',
      life: PlantLife.Dead(),
    })

    const decided = recordCareOnAll(
      [
        [fresh, env({ newCareLogId: 'care-fresh' })],
        [cared, env({ newCareLogId: 'care-cared' })],
        [dead, env({ newCareLogId: 'care-dead' })],
      ],
      water()
    )

    expect(
      Array.map(decided.outcome, (outcome) =>
        outcome._tag === 'Skipped'
          ? [outcome.plantId, outcome.reason._tag]
          : [outcome.plantId, outcome._tag]
      )
    ).toEqual([
      ['fresh', 'Recorded'],
      ['cared', 'AlreadyCared'],
      ['dead', 'Dead'],
    ])
    expect(
      Array.filter(decided.events, (event) => event._tag === 'CareRecorded')
    ).toHaveLength(1)
    expect(tags(decided.writes)).toEqual(['InsertCare', 'PutSchedule'])
  })
})

describe('amendCare', () => {
  const twoCares = plant([
    line('watering', {
      frequency: 7,
      dueDay: '2026-11-17',
      history: [
        ['latest', '2026-11-10'],
        ['older', '2026-11-03'],
      ],
    }),
  ])
  const moveTo = (value: string) => ({
    on: Option.some(CareWhen.Day({ day: day(value) })),
    notes: Option.none(),
    photoUrl: Option.none(),
  })

  it('moves the due day when the latest care moves', () => {
    const decided = pipe(
      amendCare(twoCares, 'latest', 'watering', moveTo('2026-11-08'), env()),
      Result.getOrThrow
    )
    expect(dueDayWritten(decided.writes)).toBe('2026-11-15')
  })

  it('keeps the due day when only the notes change', () => {
    const decided = pipe(
      amendCare(
        twoCares,
        'latest',
        'watering',
        {
          on: Option.none(),
          notes: Option.some(Option.some('repotted too')),
          photoUrl: Option.none(),
        },
        env()
      ),
      Result.getOrThrow
    )
    expect(tags(decided.writes)).toEqual(['ReplaceCare'])
    expect(Array.map(decided.events, (event) => event._tag)).toEqual([
      'CareAmended',
    ])
  })

  it('refuses a move onto a day that already has a care', () => {
    expect(
      refusalOf(
        amendCare(twoCares, 'latest', 'watering', moveTo('2026-11-03'), env())
      )
    ).toBe('AlreadyCared')
  })

  it('accepts a move onto its own day and refuses a future day', () => {
    expect(
      refusalOf(
        amendCare(twoCares, 'latest', 'watering', moveTo('2026-11-10'), env())
      )
    ).toBe('accepted')
    expect(
      refusalOf(
        amendCare(twoCares, 'latest', 'watering', moveTo('2026-11-13'), env())
      )
    ).toBe('FutureDay')
  })

  it('refuses a care that is not on the line', () => {
    expect(
      refusalOf(
        amendCare(twoCares, 'missing', 'watering', moveTo('2026-11-08'), env())
      )
    ).toBe('CareNotFound')
  })

  it('edits history of a dead plant without touching its schedule', () => {
    const decided = pipe(
      amendCare(
        { ...twoCares, life: PlantLife.Dead() },
        'latest',
        'watering',
        moveTo('2026-11-08'),
        env()
      ),
      Result.getOrThrow
    )
    expect(tags(decided.writes)).toEqual(['ReplaceCare'])
  })
})

describe('removeCare', () => {
  const twoCares = plant([
    line('watering', {
      frequency: 7,
      dueDay: '2026-11-17',
      history: [
        ['latest', '2026-11-10'],
        ['older', '2026-11-03'],
      ],
    }),
  ])

  it('falls back to the previous care when the latest is removed', () => {
    const decided = pipe(
      removeCare(twoCares, 'latest', 'watering', env()),
      Result.getOrThrow
    )
    expect(tags(decided.writes)).toEqual(['DeleteCare', 'PutSchedule'])
    expect(dueDayWritten(decided.writes)).toBe('2026-11-10')
  })

  it('keeps the due day when an older care is removed', () => {
    const decided = pipe(
      removeCare(twoCares, 'older', 'watering', env()),
      Result.getOrThrow
    )
    expect(tags(decided.writes)).toEqual(['DeleteCare'])
  })

  it('returns to the schedule start when the only care is removed', () => {
    const single = plant([
      line('watering', {
        frequency: 7,
        dueDay: '2026-11-17',
        history: [['only', '2026-11-10']],
      }),
    ])
    const decided = pipe(
      removeCare(single, 'only', 'watering', env()),
      Result.getOrThrow
    )
    expect(dueDayWritten(decided.writes)).toBe('2026-10-01')
  })
})

describe('correctLastCare', () => {
  const on = (value: string) => CareWhen.Day({ day: day(value) })

  it('moves the latest care and derives the due day from it', () => {
    const cared = plant([
      line('watering', {
        frequency: 7,
        dueDay: '2026-11-19',
        history: [['latest', '2026-11-12']],
      }),
    ])
    const decided = pipe(
      correctLastCare(cared, 'watering', on('2026-11-09'), env()),
      Result.getOrThrow
    )
    expect(tags(decided.writes)).toEqual(['ReplaceCare', 'PutSchedule'])
    expect(dueDayWritten(decided.writes)).toBe('2026-11-16')
  })

  it('records a care when the line has none', () => {
    const decided = pipe(
      correctLastCare(
        plant([line('watering', { frequency: 7 })]),
        'watering',
        on('2026-11-09'),
        env()
      ),
      Result.getOrThrow
    )
    expect(tags(decided.writes)).toEqual(['InsertCare', 'PutSchedule'])
    expect(dueDayWritten(decided.writes)).toBe('2026-11-16')
  })

  it('refuses a future day and a dead plant', () => {
    const cared = plant([line('watering', { frequency: 7 })])
    expect(
      refusalOf(correctLastCare(cared, 'watering', on('2026-11-13'), env()))
    ).toBe('FutureDay')
    expect(
      refusalOf(
        correctLastCare(
          { ...cared, life: PlantLife.Dead() },
          'watering',
          on('2026-11-09'),
          env()
        )
      )
    ).toBe('Dead')
  })
})

describe('any sequence of care commands', () => {
  const lcg = (seed: number) => {
    let state = seed
    return (below: number) => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return state % below
    }
  }

  const apply = (current: CareLine, writes: ReadonlyArray<CareWrite>) =>
    Array.reduce(writes, current, (acc, write): CareLine => {
      if (write._tag === 'InsertCare') {
        return {
          ...acc,
          history: [...acc.history, { id: write.id, day: write.day }],
        }
      }
      if (write._tag === 'ReplaceCare') {
        return {
          ...acc,
          history: Array.map(acc.history, (entry) =>
            entry.id === write.id
              ? {
                  ...entry,
                  day: pipe(
                    write.when,
                    Option.map((when) => when.day),
                    Option.getOrElse(() => entry.day)
                  ),
                }
              : entry
          ),
        }
      }
      if (write._tag === 'DeleteCare') {
        return {
          ...acc,
          history: Array.filter(acc.history, (entry) => entry.id !== write.id),
        }
      }
      if (write._tag === 'PutSchedule') {
        return { ...acc, schedule: Option.some(write.schedule) }
      }
      return acc
    })

  const sorted = (current: CareLine): CareLine => ({
    ...current,
    history: [...current.history].sort((a, b) => (a.day < b.day ? 1 : -1)),
  })

  it.each([1, 7, 42, 1337, 90210])('holds the invariants (seed %i)', (seed) => {
    const next = lcg(seed)
    let current = line('watering', { frequency: 5, dueDay: '2026-10-01' })
    let lastChangeMovedLatest = false

    for (const step of Array.range(1, 120)) {
      const state = plant([current])
      const target = CareWhen.Day({
        day: CareDays.addDays(today, 2 - next(30)),
      })
      const victim = pipe(
        Array.get(current.history, next(Math.max(1, current.history.length))),
        Option.map((entry) => entry.id),
        Option.getOrElse(() => 'missing')
      )
      const e = env({ newCareLogId: `care-${step}` })
      const command = next(4)
      const result: Result.Result<
        { readonly writes: ReadonlyArray<CareWrite> },
        unknown
      > =
        command === 0
          ? recordCare(state, water({ on: target }), e)
          : command === 1
            ? amendCare(
                state,
                victim,
                'watering',
                {
                  on: Option.some(target),
                  notes: Option.none(),
                  photoUrl: Option.none(),
                },
                e
              )
            : command === 2
              ? removeCare(state, victim, 'watering', e)
              : correctLastCare(state, 'watering', target, e)

      if (Result.isSuccess(result)) {
        const latestBefore = Array.head(current.history)
        current = sorted(apply(current, result.success.writes))
        lastChangeMovedLatest =
          Array.head(current.history).pipe(
            Option.map((entry) => entry.day),
            Option.getOrNull
          ) !==
          latestBefore.pipe(
            Option.map((entry) => entry.day),
            Option.getOrNull
          )

        const days = Array.map(current.history, (entry) => entry.day)
        expect(new Set(days).size).toBe(days.length)
        expect(Array.every(days, (d) => d <= today)).toBe(true)
        if (lastChangeMovedLatest) {
          expect(
            Option.map(current.schedule, (schedule) => schedule.dueDay)
          ).toEqual(nextDueDay(current, today, Option.none()))
        }
      }
    }
    expect(current.history.length).toBeGreaterThan(0)
  })
})
