import type {
  AbsenceEvent,
  DelegationEndReason,
} from '@lily/api/contexts/absence'
import {
  asDelegationError,
  asOpenError,
} from '@lily/api/contexts/absence/absence'
import {
  Delegation,
  DelegationCommand,
  DelegationRefusal,
  DelegationWrite,
  MAY,
  type NoticeKind,
  type OpenFacts,
  OpenRefusal,
  type OpenRequest,
  open,
  type Party,
  type Role,
  RULES,
  type Status,
  type Terms,
  transition,
  type UserCommand,
} from '@lily/api/contexts/absence/domain/delegation'
import {
  STAMPED_ON_REACHING,
  stampOf,
  statusOf,
} from '@lily/api/contexts/absence/store'
import { decision } from '@lily/api/kernel/transact'
import {
  CannotDelegateSelfError,
  CanopyId,
  CanopyPlantNotDelegableError,
  DelegationDateError,
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  DelegationOverlapError,
  UserNotFoundError,
} from '@lily/shared'
import { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import { Array, DateTime, Option, Result, Struct } from 'effect'
import { describe, expect, it } from 'vitest'

const start = DateTime.makeUnsafe('2026-11-10T00:00:00Z')
const end = DateTime.makeUnsafe('2026-11-20T00:00:00Z')
const afterTheEnd = DateTime.makeUnsafe('2026-12-01T00:00:00Z')

const alex: Party = { id: 'alex', name: Option.some('Alex'), language: 'en' }
const lily: Party = { id: 'lily', name: Option.some('Lily'), language: 'fr' }

const terms: Terms = {
  id: 'delegation-1',
  owner: alex,
  caretaker: lily,
  start,
  end,
  plants: [
    { id: 'buried', living: false },
    { id: 'fern', living: true },
    { id: 'monstera', living: true },
  ],
}

const PARTY_IN = { owner: alex, caretaker: lily } satisfies Record<Role, Party>

type Command = DelegationCommand['_tag']

const COMMAND = {
  Accept: (by) => DelegationCommand.Accept({ by }),
  Decline: (by) => DelegationCommand.Decline({ by }),
  Cancel: (by) => DelegationCommand.Cancel({ by }),
  CompleteEarly: (by) => DelegationCommand.CompleteEarly({ by }),
  Advance: () => DelegationCommand.Advance(),
  ReleaseForDeletedAccount: () => DelegationCommand.ReleaseForDeletedAccount(),
} satisfies Record<Command, (by: string) => DelegationCommand>

const USER_COMMANDS = Struct.keys(MAY)

const isUserCommand = (command: Command): command is UserCommand['_tag'] =>
  Array.contains(USER_COMMANDS, command)

const byTheRightParty = (command: Command) =>
  COMMAND[command](isUserCommand(command) ? PARTY_IN[MAY[command]].id : '')

type Fact = 'started' | DelegationEndReason

interface Moves {
  readonly to: Status
  readonly fact?: Fact
  readonly tells?: ReadonlyArray<readonly [NoticeKind, Role]>
}

type Expected = 'refused' | 'stays' | Moves

const tellsTheCaretaker = (kind: NoticeKind) => [[kind, 'caretaker']] as const
const tellsTheOwner = (kind: NoticeKind) => [[kind, 'owner']] as const
const tellsBoth = (kind: NoticeKind) =>
  [
    [kind, 'owner'],
    [kind, 'caretaker'],
  ] as const

const EXPECTED: Record<Command, Record<Status, Expected>> = {
  Accept: {
    Pending: { to: 'Accepted', tells: tellsTheOwner('Accepted') },
    Accepted: 'refused',
    Active: 'refused',
    Rejected: 'refused',
    Canceled: 'refused',
    Completed: 'refused',
  },
  Decline: {
    Pending: { to: 'Rejected', tells: tellsTheOwner('Declined') },
    Accepted: 'refused',
    Active: 'refused',
    Rejected: 'refused',
    Canceled: 'refused',
    Completed: 'refused',
  },
  Cancel: {
    Pending: { to: 'Canceled', tells: tellsTheCaretaker('CalledOff') },
    Accepted: { to: 'Canceled', tells: tellsTheCaretaker('CalledOff') },
    Active: {
      to: 'Canceled',
      fact: 'canceled',
      tells: tellsTheCaretaker('CalledOff'),
    },
    Rejected: 'refused',
    Canceled: 'refused',
    Completed: 'refused',
  },
  CompleteEarly: {
    Pending: 'refused',
    Accepted: 'refused',
    Active: { to: 'Completed', fact: 'completedEarly' },
    Rejected: 'refused',
    Canceled: 'refused',
    Completed: 'refused',
  },
  Advance: {
    Pending: { to: 'Canceled', tells: tellsTheOwner('Lapsed') },
    Accepted: { to: 'Active', fact: 'started', tells: tellsBoth('Began') },
    Active: {
      to: 'Completed',
      fact: 'completed',
      tells: tellsBoth('Finished'),
    },
    Rejected: 'stays',
    Canceled: 'stays',
    Completed: 'stays',
  },
  ReleaseForDeletedAccount: {
    Pending: { to: 'Canceled' },
    Accepted: { to: 'Canceled' },
    Active: { to: 'Canceled', fact: 'accountDeleted' },
    Rejected: 'stays',
    Canceled: 'stays',
    Completed: 'stays',
  },
}

const handedOver = {
  delegationId: terms.id,
  ownerId: 'alex',
  caretakerId: 'lily',
  plantIds: ['buried', 'fern', 'monstera'],
}

const factOf = (fact: Fact | undefined): ReadonlyArray<AbsenceEvent> =>
  fact === undefined
    ? []
    : fact === 'started'
      ? [{ _tag: 'DelegationStarted', ...handedOver }]
      : [{ _tag: 'DelegationEnded', ...handedOver, reason: fact }]

const OTHER = { owner: 'caretaker', caretaker: 'owner' } satisfies Record<
  Role,
  Role
>

const cells = Array.flatMap(Struct.keys(RULES), (command) =>
  Array.map(Struct.keys(RULES[command]), (status) => ({
    command,
    status,
    expected: EXPECTED[command][status],
  }))
)

describe('what a command does to a delegation', () => {
  it('covers 36 cells', () => {
    expect(cells).toHaveLength(36)
  })

  it.each(cells)('$command on $status', ({ command, status, expected }) => {
    const state = Delegation[status](terms)

    const decided = transition(state, byTheRightParty(command), afterTheEnd)

    if (expected === 'refused') {
      expect(decided).toEqual(
        Result.fail(
          DelegationRefusal.WrongStatus({
            command: command as UserCommand['_tag'],
            current: status,
          })
        )
      )
      return
    }
    if (expected === 'stays') {
      expect(decided).toEqual(
        Result.succeed(decision({ value: Option.none(), notices: [] }))
      )
      return
    }
    expect(decided).toEqual(
      Result.succeed(
        decision(
          {
            value: Option.some(expected.to),
            notices: Array.map(expected.tells ?? [], ([kind, role]) => ({
              kind,
              to: PARTY_IN[role],
              from: PARTY_IN[OTHER[role]],
              delegationId: terms.id,
              livingPlants: 2,
            })),
          },
          [
            DelegationWrite.MoveDelegation({
              id: terms.id,
              from: status,
              to: expected.to,
              at: afterTheEnd,
            }),
          ],
          factOf(expected.fact)
        )
      )
    )
  })
})

describe('what the scheduler waits for', () => {
  const justBefore = (instant: DateTime.Utc) =>
    DateTime.subtract(instant, { milliseconds: 1 })
  const advance = (state: Delegation, now: DateTime.Utc) =>
    Result.map(
      transition(state, DelegationCommand.Advance(), now),
      (decided) => decided.outcome.value
    )

  it('leaves a request nobody answered until its start', () => {
    expect(advance(Delegation.Pending(terms), justBefore(start))).toEqual(
      Result.succeed(Option.none())
    )
  })

  it('cancels a request nobody answered at its start', () => {
    expect(advance(Delegation.Pending(terms), start)).toEqual(
      Result.succeed(Option.some('Canceled'))
    )
  })

  it('tells the owner alone, in the name of the caretaker, that nobody answered', () => {
    const lapsed = transition(
      Delegation.Pending(terms),
      DelegationCommand.Advance(),
      start
    )

    expect(Result.map(lapsed, (decided) => decided.outcome.notices)).toEqual(
      Result.succeed([
        {
          kind: 'Lapsed',
          to: alex,
          from: lily,
          delegationId: terms.id,
          livingPlants: 2,
        },
      ])
    )
    expect(Result.map(lapsed, (decided) => decided.events)).toEqual(
      Result.succeed([])
    )
  })

  it('leaves an accepted delegation until its start', () => {
    expect(advance(Delegation.Accepted(terms), justBefore(start))).toEqual(
      Result.succeed(Option.none())
    )
  })

  it('starts an accepted delegation at its start', () => {
    expect(advance(Delegation.Accepted(terms), start)).toEqual(
      Result.succeed(Option.some('Active'))
    )
  })

  it('leaves a running delegation until its end', () => {
    expect(advance(Delegation.Active(terms), justBefore(end))).toEqual(
      Result.succeed(Option.none())
    )
  })

  it('completes a running delegation at its end', () => {
    expect(advance(Delegation.Active(terms), end)).toEqual(
      Result.succeed(Option.some('Completed'))
    )
  })

  it.each(['Pending', 'Accepted'] as const)(
    'lets the owner cancel a %s delegation before its start',
    (status) => {
      const decided = transition(
        Delegation[status](terms),
        DelegationCommand.Cancel({ by: 'alex' }),
        justBefore(start)
      )

      expect(Result.map(decided, (made) => made.outcome.value)).toEqual(
        Result.succeed(Option.some('Canceled'))
      )
    }
  )
})

describe('who may ask', () => {
  const everyStatus = Struct.keys(RULES.Accept)
  const askedByTheWrongPerson = Array.flatMap(USER_COMMANDS, (command) =>
    Array.flatMap(everyStatus, (status) =>
      Array.map([PARTY_IN[OTHER[MAY[command]]].id, 'a-stranger'], (by) => ({
        command,
        status,
        by,
      }))
    )
  )

  it.each(askedByTheWrongPerson)(
    '$command on $status is not for $by',
    ({ command, status, by }) => {
      expect(
        transition(Delegation[status](terms), COMMAND[command](by), afterTheEnd)
      ).toEqual(Result.fail(DelegationRefusal.NotAllowed({ command })))
    }
  )

  it('lets the caretaker answer and the owner call off or finish', () => {
    expect(MAY).toEqual({
      Accept: 'caretaker',
      Decline: 'caretaker',
      Cancel: 'owner',
      CompleteEarly: 'owner',
    })
  })
})

describe('the date a status stamps', () => {
  const at = DateTime.makeUnsafe('2026-11-13T09:00:00Z')
  const when = DateTime.toDateUtc(at)
  const STAMPS: Record<Status, object> = {
    Pending: {},
    Accepted: { respondedAt: when },
    Rejected: { respondedAt: when },
    Active: {},
    Canceled: { canceledAt: when },
    Completed: { completedAt: when },
  }

  it.each(Struct.keys(STAMPED_ON_REACHING))('reaching %s', (status) => {
    expect(stampOf(status, at)).toEqual(STAMPS[status])
  })

  it.each(Struct.keys(STAMPED_ON_REACHING))(
    'stores %s in lower case',
    (status) => {
      expect(statusOf(status)).toBe(status.toLowerCase())
    }
  )
})

describe('opening a delegation', () => {
  const now = DateTime.makeUnsafe('2026-11-01T00:00:00Z')
  const env = { now, newDelegationId: 'new-delegation' }
  const home = CanopyId.make('home')
  const mine = (id: string) => ({
    id,
    living: true,
    owner: { _tag: 'User', userId: 'alex' } as const,
  })
  const ofCanopy = (id: string, canopyId: CanopyId) => ({
    id,
    living: true,
    owner: { _tag: 'Canopy', canopyId } as const,
  })
  const foreign = {
    id: 'foreign',
    living: true,
    owner: { _tag: 'User', userId: 'someone-else' } as const,
  }

  const everythingWrong: { facts: OpenFacts; request: OpenRequest } = {
    facts: {
      owner: alex,
      caretaker: Option.none(),
      plants: [ofCanopy('shared', home), foreign],
      canopyOfCaller: Option.some(home),
      overlapping: ['fern'],
    },
    request: {
      by: 'alex',
      caretakerId: 'alex',
      start: DateTime.subtract(now, { days: 1 }),
      end: DateTime.subtract(now, { days: 2 }),
      message: Option.some('Back soon'),
      plantIds: [],
    },
  }

  type Scenario = typeof everythingWrong
  const REPAIRS: ReadonlyArray<
    readonly [OpenRefusal, (scenario: Scenario) => Scenario]
  > = [
    [
      OpenRefusal.Self(),
      ({ facts, request }) => ({
        facts,
        request: { ...request, caretakerId: 'lily' },
      }),
    ],
    [
      OpenRefusal.CaretakerUnknown({ caretakerId: 'lily' }),
      ({ facts, request }) => ({
        facts: { ...facts, caretaker: Option.some(lily) },
        request,
      }),
    ],
    [
      OpenRefusal.StartInPast(),
      ({ facts, request }) => ({ facts, request: { ...request, start: now } }),
    ],
    [
      OpenRefusal.EndNotAfterStart(),
      ({ facts, request }) => ({
        facts,
        request: { ...request, end: DateTime.add(now, { days: 7 }) },
      }),
    ],
    [
      OpenRefusal.NoPlants(),
      ({ facts, request }) => ({
        facts,
        request: { ...request, plantIds: ['shared', 'foreign'] },
      }),
    ],
    [
      OpenRefusal.CanopyPlant({ plantId: 'shared' }),
      ({ facts, request }) => ({
        facts: { ...facts, plants: [foreign, mine('fern')] },
        request: { ...request, plantIds: ['foreign', 'fern'] },
      }),
    ],
    [
      OpenRefusal.NotOwner(),
      ({ facts, request }) => ({
        facts: { ...facts, plants: [mine('fern'), mine('monstera')] },
        request: { ...request, plantIds: ['fern', 'monstera'] },
      }),
    ],
    [
      OpenRefusal.Overlap({ plantIds: ['fern'] }),
      ({ facts, request }) => ({
        facts: { ...facts, overlapping: [] },
        request,
      }),
    ],
  ]

  const repairedUntil = (count: number) =>
    Array.reduce(
      Array.take(REPAIRS, count),
      everythingWrong,
      (scenario, [, repair]) => repair(scenario)
    )

  it.each(
    Array.map(REPAIRS, ([refusal], index) => ({ tag: refusal._tag, index }))
  )('refuses with $tag once every earlier reason is gone', ({ index }) => {
    const { facts, request } = repairedUntil(index)

    expect(open(facts, request, env)).toEqual(Result.fail(REPAIRS[index]?.[0]))
  })

  it('checks eight reasons', () => {
    expect(REPAIRS).toHaveLength(8)
  })

  it('opens a pending request and tells the caretaker, with no fact', () => {
    const { facts, request } = repairedUntil(REPAIRS.length)

    expect(open(facts, request, env)).toEqual(
      Result.succeed(
        decision(
          {
            value: { delegationId: 'new-delegation' },
            notices: [
              {
                kind: 'Requested',
                to: lily,
                from: alex,
                delegationId: 'new-delegation',
                livingPlants: 2,
              },
            ],
          },
          [
            DelegationWrite.OpenDelegation({
              id: 'new-delegation',
              ownerId: 'alex',
              caretakerId: 'lily',
              start: now,
              end: DateTime.add(now, { days: 7 }),
              message: Option.some('Back soon'),
              plantIds: ['fern', 'monstera'],
            }),
          ]
        )
      )
    )
  })

  const valid = repairedUntil(REPAIRS.length)

  it('refuses a plant that no longer exists like a plant of someone else', () => {
    expect(
      open({ ...valid.facts, plants: [mine('fern')] }, valid.request, env)
    ).toEqual(Result.fail(OpenRefusal.NotOwner()))
  })

  it('refuses a plant of a canopy the caller is not in like a plant of someone else', () => {
    expect(
      open(
        {
          ...valid.facts,
          plants: [mine('fern'), ofCanopy('monstera', CanopyId.make('other'))],
        },
        valid.request,
        env
      )
    ).toEqual(Result.fail(OpenRefusal.NotOwner()))
  })

  it('refuses an end that equals the start', () => {
    expect(
      open(valid.facts, { ...valid.request, end: valid.request.start }, env)
    ).toEqual(Result.fail(OpenRefusal.EndNotAfterStart()))
  })
})

describe('the error a refusal answers with', () => {
  const ANSWERED: Record<
    UserCommand['_tag'],
    { notAllowed: string; expectedStatus: string; wrongStatus: string }
  > = {
    Accept: {
      notAllowed: 'Only the caretaker can respond to a delegation request',
      expectedStatus: 'pending',
      wrongStatus: 'This delegation has already been responded to',
    },
    Decline: {
      notAllowed: 'Only the caretaker can respond to a delegation request',
      expectedStatus: 'pending',
      wrongStatus: 'This delegation has already been responded to',
    },
    Cancel: {
      notAllowed: 'Only the delegation owner can cancel',
      expectedStatus: 'pending, accepted, or active',
      wrongStatus: 'This delegation cannot be canceled in its current state',
    },
    CompleteEarly: {
      notAllowed: 'Only the delegation owner can complete early',
      expectedStatus: 'active',
      wrongStatus: 'Only active delegations can be completed early',
    },
  }

  it('answers a delegation that is gone with not found', () => {
    expect(
      asDelegationError(DelegationRefusal.Gone({ delegationId: 'gone' }))
    ).toEqual(new DelegationNotFoundError({ delegationId: 'gone' }))
  })

  it.each(USER_COMMANDS)('%s by the wrong person', (command) => {
    const error = asDelegationError(DelegationRefusal.NotAllowed({ command }))

    expect(error).toBeInstanceOf(DelegationNotAuthorizedError)
    expect(error.message).toBe(ANSWERED[command].notAllowed)
  })

  it.each(USER_COMMANDS)('%s in the wrong status', (command) => {
    expect(
      asDelegationError(
        DelegationRefusal.WrongStatus({ command, current: 'Completed' })
      )
    ).toEqual(
      new DelegationInvalidStatusError({
        currentStatus: 'completed',
        expectedStatus: ANSWERED[command].expectedStatus,
        message: ANSWERED[command].wrongStatus,
      })
    )
  })

  const OPENING: {
    [T in OpenRefusal['_tag']]: readonly [OpenRefusal, { message: string }]
  } = {
    Self: [OpenRefusal.Self(), new CannotDelegateSelfError()],
    CaretakerUnknown: [
      OpenRefusal.CaretakerUnknown({ caretakerId: 'lily' }),
      new UserNotFoundError({ userId: 'lily' }),
    ],
    StartInPast: [
      OpenRefusal.StartInPast(),
      new DelegationDateError({ message: 'Start date must be in the future' }),
    ],
    EndNotAfterStart: [
      OpenRefusal.EndNotAfterStart(),
      new DelegationDateError({ message: 'End date must be after start date' }),
    ],
    NoPlants: [
      OpenRefusal.NoPlants(),
      new DelegationDateError({
        message: 'At least one plant must be selected',
      }),
    ],
    CanopyPlant: [
      OpenRefusal.CanopyPlant({ plantId: 'shared' }),
      new CanopyPlantNotDelegableError({ plantId: 'shared' }),
    ],
    NotOwner: [OpenRefusal.NotOwner(), new PlantNotAuthorizedError()],
    Overlap: [
      OpenRefusal.Overlap({ plantIds: ['fern'] }),
      new DelegationOverlapError({ plantIds: ['fern'] }),
    ],
  }

  it.each(Struct.keys(OPENING))('%s when opening', (tag) => {
    const [refusal, error] = OPENING[tag]
    const answered = asOpenError(refusal)

    expect(answered).toEqual(error)
    expect(answered.message).toBe(error.message)
  })
})
