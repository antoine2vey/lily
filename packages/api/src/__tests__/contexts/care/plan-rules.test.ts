import {
  createTestCareLine,
  createTestCarePlant,
  TEST_CARE_TODAY,
} from '@lily/api/__tests__/fixtures/care-plants'
import {
  type CarePlant,
  type DecideEnv,
  LifeState,
} from '@lily/api/contexts/care/domain/care-plant'
import type {
  CareWrite,
  Decision,
  Refusal,
} from '@lily/api/contexts/care/domain/decide'
import {
  DEAD_PLANT_TAKES,
  earliestOpenDuePerCareType,
  type Plan,
  type PlanCommand,
  type PlanStatus,
  type PlanStep,
  RULES,
  statusToSettleInto,
} from '@lily/api/contexts/care/domain/plan'
import {
  acceptPlan,
  deletePlan,
  dismissPlan,
  dropStep,
  linkPlanToDiagnosis,
  type Proposal,
  proposePlan,
  tickStep,
  untickStep,
} from '@lily/api/contexts/care/domain/plan-decide'
import { asError } from '@lily/api/contexts/care/refusals'
import { CareDay, LimitExceededError } from '@lily/shared'
import { Array, DateTime, Option, Result, Struct } from 'effect'
import { describe, expect, it } from 'vitest'

const now = DateTime.makeUnsafe('2026-11-12T09:00:00Z')
const at = (iso: string) => Option.some(DateTime.makeUnsafe(iso))

const step = (id: string, overrides: Partial<PlanStep> = {}): PlanStep => ({
  id,
  position: 0,
  careType: Option.none(),
  dueAt: Option.none(),
  done: false,
  ...overrides,
})

const plan = (
  status: PlanStatus,
  steps: ReadonlyArray<PlanStep>,
  overrides: Partial<Plan> = {}
): Plan => ({
  id: 'plan-1',
  status,
  createdAt: DateTime.makeUnsafe('2026-11-01T00:00:00Z'),
  steps: Array.map(steps, (each, position) => ({ ...each, position })),
  ...overrides,
})

const plantWith = (
  plans: ReadonlyArray<Plan>,
  overrides: Parameters<typeof createTestCarePlant>[1] = {}
): Option.Option<CarePlant> =>
  Option.some(createTestCarePlant('plant-1', { plans, ...overrides }))

const env: DecideEnv = {
  now,
  newCareLogId: 'care-new',
  wateringDays: Option.none(),
  by: Option.some('user-1'),
}

type Seen =
  | { readonly refused: Refusal['_tag'] }
  | {
      readonly writes: ReadonlyArray<CareWrite['_tag']>
      readonly status: PlanStatus
    }

const seen = (
  held: PlanStatus,
  decided: Result.Result<Decision<void>, Refusal>
): Seen =>
  Result.match(decided, {
    onFailure: (refusal) => ({ refused: refusal._tag }),
    onSuccess: ({ writes }) => ({
      writes: Array.map(writes, (write) => write._tag),
      status: Array.reduce(writes, held, (status, write) =>
        write._tag === 'SetPlanStatus' ? write.to : status
      ),
    }),
  })

const ran = (
  status: PlanStatus,
  ...writes: ReadonlyArray<CareWrite['_tag']>
): Seen => ({ writes, status })
const NOT_PROPOSED: Seen = { refused: 'PlanNotProposed' }
const NO_SUCH_PLAN: Seen = { refused: 'PlanOfDeadPlant' }

const oneOpenOneDone = [step('open'), step('done', { done: true })]

const DECIDED_BY = {
  Accept: (plant) => acceptPlan(plant, 'plan-1', now),
  Dismiss: (plant) => dismissPlan(plant, 'plan-1', now),
  Delete: (plant) => deletePlan(plant, 'plan-1', now),
  TickStep: (plant) => tickStep(plant, 'plan-1', 'open', env),
  UntickStep: (plant) => untickStep(plant, 'plan-1', 'done', now),
  DropStep: (plant) => dropStep(plant, 'plan-1', 'open', now),
  LinkToDiagnosis: (plant) =>
    linkPlanToDiagnosis(plant, 'plan-1', 'diagnosis-1', now),
} satisfies Record<
  PlanCommand,
  (plant: Option.Option<CarePlant>) => Result.Result<Decision<void>, Refusal>
>

const ON_A_LIVING_PLANT = {
  Accept: {
    proposed: ran('accepted', 'SetPlanStatus'),
    accepted: NOT_PROPOSED,
    dismissed: NOT_PROPOSED,
    completed: NOT_PROPOSED,
  },
  Dismiss: {
    proposed: ran('dismissed', 'SetPlanStatus'),
    accepted: NOT_PROPOSED,
    dismissed: NOT_PROPOSED,
    completed: NOT_PROPOSED,
  },
  Delete: {
    proposed: ran('proposed', 'DeletePlan'),
    accepted: ran('accepted', 'DeletePlan'),
    dismissed: ran('dismissed', 'DeletePlan'),
    completed: ran('completed', 'DeletePlan'),
  },
  TickStep: {
    proposed: ran('proposed', 'CompletePlanStep'),
    accepted: ran('completed', 'CompletePlanStep', 'SetPlanStatus'),
    dismissed: ran('dismissed', 'CompletePlanStep'),
    completed: ran('completed', 'CompletePlanStep'),
  },
  UntickStep: {
    proposed: ran('proposed', 'ReopenPlanStep'),
    accepted: ran('accepted', 'ReopenPlanStep'),
    dismissed: ran('dismissed', 'ReopenPlanStep'),
    completed: ran('accepted', 'ReopenPlanStep', 'SetPlanStatus'),
  },
  DropStep: {
    proposed: ran('proposed', 'DeletePlanStep'),
    accepted: ran('completed', 'DeletePlanStep', 'SetPlanStatus'),
    dismissed: ran('dismissed', 'DeletePlanStep'),
    completed: ran('completed', 'DeletePlanStep'),
  },
  LinkToDiagnosis: {
    proposed: ran('proposed', 'LinkPlanToDiagnosis'),
    accepted: ran('accepted', 'LinkPlanToDiagnosis'),
    dismissed: ran('dismissed', 'LinkPlanToDiagnosis'),
    completed: ran('completed', 'LinkPlanToDiagnosis'),
  },
} satisfies { readonly [C in PlanCommand]: Record<PlanStatus, Seen> }

const cells = Array.flatMap(Struct.keys(RULES), (command) =>
  Array.map(Struct.keys(RULES[command]), (status) => [command, status] as const)
)

describe('the care plan rules', () => {
  it.each(cells)('%s on a %s plan of a living plant', (command, status) => {
    const decided = DECIDED_BY[command](
      plantWith([plan(status, oneOpenOneDone)])
    )

    expect(seen(status, decided)).toEqual(ON_A_LIVING_PLANT[command][status])
  })

  it.each(cells)('%s on a %s plan of a dead plant', (command, status) => {
    const decided = DECIDED_BY[command](
      plantWith([plan(status, oneOpenOneDone)], { life: LifeState.Dead() })
    )

    expect(seen(status, decided)).toEqual(
      DEAD_PLANT_TAKES[command]
        ? ON_A_LIVING_PLANT[command][status]
        : NO_SUCH_PLAN
    )
  })
})

describe('the status a plan settles into', () => {
  const noStep: ReadonlyArray<PlanStep> = []
  const allOpen = [step('a'), step('b')]
  const someDone = [step('a', { done: true }), step('b')]
  const allDone = [step('a', { done: true }), step('b', { done: true })]

  const SETTLES_INTO = {
    proposed: { noStep: null, allOpen: null, someDone: null, allDone: null },
    dismissed: { noStep: null, allOpen: null, someDone: null, allDone: null },
    accepted: {
      noStep: null,
      allOpen: null,
      someDone: null,
      allDone: 'completed',
    },
    completed: {
      noStep: null,
      allOpen: 'accepted',
      someDone: 'accepted',
      allDone: null,
    },
  } satisfies Record<
    PlanStatus,
    Record<'noStep' | 'allOpen' | 'someDone' | 'allDone', PlanStatus | null>
  >
  const STEPS = { noStep, allOpen, someDone, allDone }

  it.each(
    Array.flatMap(Struct.keys(SETTLES_INTO), (status) =>
      Array.map(Struct.keys(STEPS), (steps) => [status, steps] as const)
    )
  )('%s with %s', (status, steps) => {
    expect(
      Option.getOrNull(statusToSettleInto({ status, steps: STEPS[steps] }))
    ).toBe(SETTLES_INTO[status][steps])
  })
})

describe('the due days an accept moves', () => {
  it('keeps the earliest dated step per care type and drops undated ones', () => {
    expect(
      earliestOpenDuePerCareType([
        step('a', {
          careType: Option.some('watering'),
          dueAt: at('2024-02-05T00:00:00Z'),
        }),
        step('b', {
          careType: Option.some('watering'),
          dueAt: at('2024-02-01T00:00:00Z'),
        }),
        step('c', { careType: Option.some('repotting') }),
        step('d', { dueAt: at('2024-02-02T00:00:00Z') }),
        step('e'),
      ])
    ).toEqual([
      {
        careType: 'watering',
        dueAt: DateTime.makeUnsafe('2024-02-01T00:00:00Z'),
      },
    ])
  })

  it('skips a step that is already done (a change: a done step used to count)', () => {
    expect(
      earliestOpenDuePerCareType([
        step('done', {
          careType: Option.some('watering'),
          dueAt: at('2024-02-01T00:00:00Z'),
          done: true,
        }),
        step('open', {
          careType: Option.some('watering'),
          dueAt: at('2024-02-05T00:00:00Z'),
        }),
        step('misted', {
          careType: Option.some('misting'),
          dueAt: at('2024-02-03T00:00:00Z'),
          done: true,
        }),
      ])
    ).toEqual([
      {
        careType: 'watering',
        dueAt: DateTime.makeUnsafe('2024-02-05T00:00:00Z'),
      },
    ])
  })
})

describe('proposing a plan', () => {
  const proposal: Proposal = {
    planId: 'plan-new',
    plantId: 'plant-1',
    authorId: 'user-1',
    title: 'Recover from overwatering',
    source: 'ai',
    steps: [
      {
        title: 'Hold off watering',
        description: Option.none(),
        careType: Option.some('watering'),
        dueAt: at('2026-11-20T00:00:00Z'),
      },
    ],
  }
  const refusedOrWritten = (plant: Option.Option<CarePlant>) =>
    Result.match(proposePlan(plant, proposal), {
      onFailure: (refusal) => refusal,
      onSuccess: ({ outcome, writes }) => ({ outcome, writes }),
    })
  const written = {
    outcome: { planId: 'plan-new' },
    writes: [{ _tag: 'InsertPlan', ...proposal }],
  }

  it('writes the plan with its steps on a living plant', () => {
    expect(refusedOrWritten(plantWith([]))).toEqual(written)
  })

  it('answers a dead plant as the table says', () => {
    expect(refusedOrWritten(plantWith([], { life: LifeState.Dead() }))).toEqual(
      DEAD_PLANT_TAKES.Propose
        ? written
        : { _tag: 'ProposalForDeadPlant', plantId: 'plant-1' }
    )
  })

  it('refuses a plant that is gone', () => {
    expect(refusedOrWritten(Option.none())).toEqual({
      _tag: 'PlantGone',
      plantId: 'plant-1',
    })
  })
})

describe('linking a plan to its diagnosis', () => {
  it('names the plan and the diagnosis', () => {
    const decided = Result.getOrThrow(
      linkPlanToDiagnosis(
        plantWith([plan('proposed', [])]),
        'plan-1',
        'diagnosis-1',
        now
      )
    )

    expect(decided.writes).toEqual([
      {
        _tag: 'LinkPlanToDiagnosis',
        planId: 'plan-1',
        diagnosisId: 'diagnosis-1',
      },
    ])
  })

  it('refuses a plan that is on another plant', () => {
    expect(
      Result.getOrThrow(
        Result.flip(
          linkPlanToDiagnosis(plantWith([]), 'plan-1', 'diagnosis-1', now)
        )
      )
    ).toEqual({ _tag: 'PlanGone', planId: 'plan-1' })
  })
})

describe('accepting a plan', () => {
  const dated = [
    step('water', {
      careType: Option.some('watering'),
      dueAt: at('2026-11-20T00:00:00Z'),
    }),
    step('mist', {
      careType: Option.some('misting'),
      dueAt: at('2026-11-22T00:00:00Z'),
      done: true,
    }),
  ]
  const lines = [createTestCareLine('watering'), createTestCareLine('misting')]

  it('moves the due day of the open dated steps only, and tells why', () => {
    const decided = Result.getOrThrow(
      acceptPlan(plantWith([plan('proposed', dated)], { lines }), 'plan-1', now)
    )

    expect(decided.writes).toEqual([
      expect.objectContaining({
        _tag: 'SetPlanStatus',
        from: 'proposed',
        to: 'accepted',
      }),
      expect.objectContaining({
        _tag: 'PutSchedule',
        careType: 'watering',
        schedule: expect.objectContaining({
          dueDay: CareDay.make('2026-11-20'),
        }),
      }),
    ])
    expect(decided.events).toEqual([
      {
        _tag: 'ScheduleChanged',
        plantId: 'plant-1',
        careType: 'watering',
        dueDay: CareDay.make('2026-11-20'),
        reason: 'carePlan',
      },
    ])
  })

  it('completes a plan whose steps are all done, moving nothing', () => {
    const allDone = Array.map(dated, (each) => ({ ...each, done: true }))

    const decided = Result.getOrThrow(
      acceptPlan(
        plantWith([plan('proposed', allDone)], { lines }),
        'plan-1',
        now
      )
    )

    expect(decided.writes).toEqual([
      expect.objectContaining({ from: 'proposed', to: 'accepted' }),
      expect.objectContaining({ from: 'accepted', to: 'completed' }),
    ])
    expect(decided.events).toEqual([])
  })

  it('leaves a plan with no step accepted', () => {
    expect(
      seen(
        'proposed',
        acceptPlan(plantWith([plan('proposed', [])]), 'plan-1', now)
      )
    ).toEqual(ran('accepted', 'SetPlanStatus'))
  })
})

describe('ticking a step', () => {
  const watering = step('water', { careType: Option.some('watering') })

  it('records the care for today and links it to the step', () => {
    const decided = Result.getOrThrow(
      tickStep(
        plantWith([plan('accepted', [watering])]),
        'plan-1',
        'water',
        env
      )
    )

    expect(Array.map(decided.writes, (write) => write._tag)).toEqual([
      'InsertCare',
      'CompletePlanStep',
      'SetPlanStatus',
      'PutSchedule',
    ])
    expect(decided.writes).toContainEqual(
      expect.objectContaining({
        _tag: 'InsertCare',
        id: 'care-new',
        day: TEST_CARE_TODAY,
        by: Option.some('user-1'),
      })
    )
    expect(decided.writes).toContainEqual(
      expect.objectContaining({
        _tag: 'CompletePlanStep',
        stepId: 'water',
        careLogId: Option.some('care-new'),
      })
    )
    expect(Array.map(decided.events, (event) => event._tag)).toContain(
      'CareRecorded'
    )
  })

  it('ticks without a care when today was already cared for', () => {
    const caredToday = plantWith([plan('proposed', [watering])], {
      lines: [createTestCareLine('watering', { caredOn: [TEST_CARE_TODAY] })],
    })

    const decided = Result.getOrThrow(
      tickStep(caredToday, 'plan-1', 'water', env)
    )

    expect(decided.writes).toEqual([
      expect.objectContaining({
        _tag: 'CompletePlanStep',
        stepId: 'water',
        careLogId: Option.none(),
      }),
    ])
    expect(decided.events).toEqual([])
  })

  it('leaves a step that is already done as it is', () => {
    const decided = Result.getOrThrow(
      tickStep(
        plantWith([plan('accepted', [{ ...watering, done: true }])]),
        'plan-1',
        'water',
        env
      )
    )

    expect(decided.writes).toEqual([])
    expect(decided.events).toEqual([])
  })
})

describe('unticking and dropping a step', () => {
  it('leaves a step that is already open as it is', () => {
    const decided = Result.getOrThrow(
      untickStep(plantWith([plan('accepted', [step('a')])]), 'plan-1', 'a', now)
    )

    expect(decided.writes).toEqual([])
  })

  it('does not complete a plan by dropping its only step', () => {
    expect(
      seen(
        'accepted',
        dropStep(plantWith([plan('accepted', [step('a')])]), 'plan-1', 'a', now)
      )
    ).toEqual(ran('accepted', 'DeletePlanStep'))
  })
})

describe('what a plan command refuses, in order', () => {
  const dead = { life: LifeState.Dead() }
  const accepted = [plan('accepted', oneOpenOneDone)]
  const refusalOf = (decided: Result.Result<Decision<void>, Refusal>) =>
    Result.match(decided, {
      onFailure: (refusal) => refusal._tag,
      onSuccess: () => 'ran',
    })

  it.each(Struct.keys(DECIDED_BY))('%s: a plant that is gone', (command) => {
    expect(refusalOf(DECIDED_BY[command](Option.none()))).toBe('PlanGone')
  })

  it.each(Struct.keys(DECIDED_BY))(
    '%s: a plan that is not on the plant, before the plant being dead',
    (command) => {
      const elsewhere = [plan('proposed', oneOpenOneDone, { id: 'other' })]

      expect(refusalOf(DECIDED_BY[command](plantWith(elsewhere)))).toBe(
        'PlanGone'
      )
      expect(refusalOf(DECIDED_BY[command](plantWith(elsewhere, dead)))).toBe(
        'PlanGone'
      )
    }
  )

  it('a dead plant before a plan that is not proposed', () => {
    expect(
      refusalOf(acceptPlan(plantWith(accepted, dead), 'plan-1', now))
    ).toBe('PlanOfDeadPlant')
    expect(
      refusalOf(dismissPlan(plantWith(accepted, dead), 'plan-1', now))
    ).toBe('PlanOfDeadPlant')
  })

  it('a dead plant before a step that is gone, and a step that is gone last', () => {
    const decide = (plant: Option.Option<CarePlant>) => [
      refusalOf(tickStep(plant, 'plan-1', 'nope', env)),
      refusalOf(untickStep(plant, 'plan-1', 'nope', now)),
      refusalOf(dropStep(plant, 'plan-1', 'nope', now)),
    ]

    expect(decide(plantWith(accepted, dead))).toEqual([
      'PlanOfDeadPlant',
      'PlanOfDeadPlant',
      'PlanOfDeadPlant',
    ])
    expect(decide(plantWith(accepted))).toEqual([
      'StepGone',
      'StepGone',
      'StepGone',
    ])
  })
})

describe('the error a refusal answers with', () => {
  const day = CareDay.make('2026-11-12')
  const REFUSED = {
    AlreadyCared: {
      refusal: {
        _tag: 'AlreadyCared',
        plantId: 'p',
        careType: 'watering',
        day,
      },
      error: 'AlreadyCaredTodayError',
    },
    FutureDay: {
      refusal: { _tag: 'FutureDay', plantId: 'p', day, today: day },
      error: 'FutureDateNotAllowedError',
    },
    Dead: {
      refusal: { _tag: 'Dead', plantId: 'p' },
      error: 'PlantIsDeadError',
    },
    PlantGone: {
      refusal: { _tag: 'PlantGone', plantId: 'p' },
      error: 'PlantNotFoundError',
    },
    CareNotFound: {
      refusal: { _tag: 'CareNotFound', careLogId: 'c' },
      error: 'CareLogNotFoundError',
    },
    PlanGone: {
      refusal: { _tag: 'PlanGone', planId: 'plan-1' },
      error: 'CarePlanNotFoundError',
    },
    PlanOfDeadPlant: {
      refusal: { _tag: 'PlanOfDeadPlant', planId: 'plan-1' },
      error: 'CarePlanNotFoundError',
    },
    StepGone: {
      refusal: { _tag: 'StepGone', planId: 'plan-1', stepId: 's' },
      error: 'CarePlanStepNotFoundError',
    },
    PlanNotProposed: {
      refusal: {
        _tag: 'PlanNotProposed',
        planId: 'plan-1',
        status: 'accepted',
      },
      error: 'CarePlanNotProposedError',
    },
    ProposalForDeadPlant: {
      refusal: { _tag: 'ProposalForDeadPlant', plantId: 'p' },
      error: 'PlantNotFoundError',
    },
    AlreadyDead: {
      refusal: { _tag: 'AlreadyDead', plantId: 'p' },
      error: 'PlantAlreadyDeadError',
    },
    NotDead: {
      refusal: { _tag: 'NotDead', plantId: 'p' },
      error: 'PlantNotDeadError',
    },
    OwnerFull: {
      refusal: {
        _tag: 'OwnerFull',
        error: new LimitExceededError({
          feature: 'plants',
          limit: 5,
          current: 5,
          message: 'full',
        }),
      },
      error: 'LimitExceededError',
    },
  } satisfies {
    readonly [T in Refusal['_tag']]: {
      readonly refusal: Extract<Refusal, { readonly _tag: T }>
      readonly error: string
    }
  }

  it.each(Struct.keys(REFUSED))('%s', (tag) => {
    const error = asError(REFUSED[tag].refusal)

    expect(error._tag).toBe(REFUSED[tag].error)
  })
})
