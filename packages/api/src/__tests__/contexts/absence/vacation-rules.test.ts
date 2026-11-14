import type { AbsenceEvent } from '@lily/api/contexts/absence'
import {
  asCancelVacationError,
  asSetVacationError,
} from '@lily/api/contexts/absence/absence'
import {
  type After,
  type Away,
  advance,
  type BadRange,
  callOff,
  type Decision,
  daysAway,
  discardForDeletedAccount,
  type Held,
  RULES,
  request,
  type StoredVacation,
  Vacation,
  VacationRefusal,
  type VacationState,
  VacationWrite,
  vacationOf,
} from '@lily/api/contexts/absence/domain/vacation'
import {
  heldVacationOf,
  storedVacationOf,
  vacationColumnsOf,
} from '@lily/api/contexts/absence/store'
import {
  type UserStatus,
  VACATION_MAX_DURATION_DAYS,
  VacationDateError,
  VacationNotFoundError,
} from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Array, DateTime, Option, Result, Struct } from 'effect'
import { describe, expect, it } from 'vitest'

const now = DateTime.makeUnsafe('2026-08-17T06:00:00Z')
const daysFromNow = (days: number) => DateTime.add(now, { days })

const ahead: Away = { start: daysFromNow(2), end: daysFromNow(9) }
const startedAlready: Away = { start: daysFromNow(-3), end: daysFromNow(4) }
const over: Away = { start: daysFromNow(-9), end: daysFromNow(-2) }

const storedAs = (vacation: Vacation): StoredVacation =>
  storedVacationOf(vacationColumnsOf(vacation))

const holding = (vacation: Vacation, timezone = 'UTC'): Held => ({
  userId: 'alex',
  timezone,
  vacation,
  stored: storedAs(vacation),
})

type Seen =
  | {
      readonly after: VacationState
      readonly changed: boolean
      readonly writes: ReadonlyArray<VacationWrite['_tag']>
      readonly events: ReadonlyArray<AbsenceEvent['_tag']>
    }
  | { readonly refused: VacationRefusal['_tag'] }

interface Case {
  readonly when: string
  readonly held: Held
  readonly asked?: Away
  readonly sees: Seen
}

const untouched = (after: VacationState): Seen => ({
  after,
  changed: false,
  writes: [],
  events: [],
})

const SCHEDULED: Seen = {
  after: 'Scheduled',
  changed: true,
  writes: ['SetVacation'],
  events: [],
}
const STARTED: Seen = {
  after: 'Active',
  changed: true,
  writes: ['SetVacation', 'SweepMuted'],
  events: ['VacationStarted'],
}
const END_MOVED: Seen = {
  after: 'Active',
  changed: true,
  writes: ['SetVacation'],
  events: [],
}
const CALLED_OFF: Seen = {
  after: 'None',
  changed: true,
  writes: ['SetVacation'],
  events: [],
}
const ENDED: Seen = {
  after: 'None',
  changed: true,
  writes: ['MoveDueDaysAfterAbsence', 'SetVacation', 'SweepMuted'],
  events: ['VacationEnded'],
}
const ENDED_WITHOUT_MOVING_DUE_DAYS: Seen = {
  after: 'None',
  changed: true,
  writes: ['SetVacation', 'SweepMuted'],
  events: ['VacationEnded'],
}

const nothing = holding(Vacation.None())
const scheduledAhead = holding(Vacation.Scheduled(ahead))
const scheduledDue = holding(Vacation.Scheduled(startedAlready))
const running = holding(Vacation.Active(startedAlready))
const ranOut = holding(Vacation.Active(over))

const EXPECTED = {
  Set: {
    None: [
      {
        when: 'asked for a start still ahead',
        held: nothing,
        asked: ahead,
        sees: SCHEDULED,
      },
      {
        when: 'asked for a start that passed',
        held: nothing,
        asked: startedAlready,
        sees: STARTED,
      },
    ],
    Scheduled: [
      {
        when: 'asked for a start still ahead',
        held: scheduledDue,
        asked: ahead,
        sees: SCHEDULED,
      },
      {
        when: 'asked for a start that passed',
        held: scheduledAhead,
        asked: startedAlready,
        sees: STARTED,
      },
    ],
    Active: [
      {
        when: 'asked for the start it has',
        held: running,
        asked: { start: startedAlready.start, end: daysFromNow(20) },
        sees: END_MOVED,
      },
      {
        when: 'asked for another start',
        held: running,
        asked: { start: daysFromNow(-1), end: daysFromNow(20) },
        sees: { refused: 'BadRange' },
      },
    ],
  },
  Cancel: {
    None: [{ when: 'always', held: nothing, sees: { refused: 'NoVacation' } }],
    Scheduled: [
      { when: 'before its start', held: scheduledAhead, sees: CALLED_OFF },
      { when: 'after its start', held: scheduledDue, sees: CALLED_OFF },
    ],
    Active: [
      { when: 'before its end', held: running, sees: ENDED },
      { when: 'after its end', held: ranOut, sees: ENDED },
    ],
  },
  Advance: {
    None: [{ when: 'always', held: nothing, sees: untouched('None') }],
    Scheduled: [
      {
        when: 'before its start',
        held: scheduledAhead,
        sees: untouched('Scheduled'),
      },
      { when: 'after its start', held: scheduledDue, sees: STARTED },
    ],
    Active: [
      { when: 'before its end', held: running, sees: untouched('Active') },
      { when: 'after its end', held: ranOut, sees: ENDED },
    ],
  },
  DiscardForDeletedAccount: {
    None: [{ when: 'always', held: nothing, sees: untouched('None') }],
    Scheduled: [
      { when: 'before its start', held: scheduledAhead, sees: CALLED_OFF },
      { when: 'after its start', held: scheduledDue, sees: CALLED_OFF },
    ],
    Active: [
      {
        when: 'before its end',
        held: running,
        sees: ENDED_WITHOUT_MOVING_DUE_DAYS,
      },
      {
        when: 'after its end',
        held: ranOut,
        sees: ENDED_WITHOUT_MOVING_DUE_DAYS,
      },
    ],
  },
} satisfies {
  readonly [C in keyof typeof RULES]: Record<
    VacationState,
    Array.NonEmptyReadonlyArray<Case>
  >
}

const DECIDED_BY = {
  Set: ({ held, asked }) => request(held, asked ?? ahead, now),
  Cancel: ({ held }) => callOff(held, now),
  Advance: ({ held }) => Result.succeed(advance(held, now)),
  DiscardForDeletedAccount: ({ held }) =>
    Result.succeed(discardForDeletedAccount(held, now)),
} satisfies Record<
  keyof typeof RULES,
  (asked: Case) => Result.Result<Decision<After>, VacationRefusal>
>

const seen = (decided: Result.Result<Decision<After>, VacationRefusal>): Seen =>
  Result.match(decided, {
    onFailure: (refusal) => ({ refused: refusal._tag }),
    onSuccess: ({ outcome, writes, events }) => ({
      after: outcome.vacation._tag,
      changed: outcome.changed,
      writes: Array.map(writes, (write) => write._tag),
      events: Array.map(events, (event) => event._tag),
    }),
  })

const cells = Array.flatMap(Struct.keys(RULES), (command) =>
  Array.flatMap(Struct.keys(RULES[command]), (state) =>
    Array.map(
      EXPECTED[command][state] as ReadonlyArray<Case>,
      (expected) => [command, state, expected.when, expected] as const
    )
  )
)

describe('the vacation rules', () => {
  it('have an expectation for every cell', () => {
    expect(
      Array.dedupe(Array.map(cells, ([command, state]) => [command, state]))
    ).toHaveLength(
      Struct.keys(RULES).length * Struct.keys(RULES.Advance).length
    )
  })

  it.each(cells)('%s on %s, %s', (command, state, _when, expected) => {
    expect(expected.held.vacation._tag).toBe(state)
    expect(seen(DECIDED_BY[command](expected))).toEqual(expected.sees)
  })
})

describe('what a vacation decision writes', () => {
  it('starts with the range asked for, against the row it read', () => {
    const decided = Result.getOrThrow(request(nothing, startedAlready, now))

    expect(decided.writes).toEqual([
      VacationWrite.SetVacation({
        userId: 'alex',
        expected: nothing.stored,
        next: Vacation.Active(startedAlready),
      }),
      VacationWrite.SweepMuted({ userId: 'alex' }),
    ])
    expect(decided.events).toEqual([
      { _tag: 'VacationStarted', userId: 'alex' },
    ])
    expect(decided.outcome.vacation).toEqual(Vacation.Active(startedAlready))
  })

  it('starts at once a vacation asked to start at this instant', () => {
    const asked = { start: now, end: daysFromNow(7) }

    expect(seen(request(nothing, asked, now))).toEqual(STARTED)
    expect(
      seen(Result.succeed(advance(holding(Vacation.Scheduled(asked)), now)))
    ).toEqual(STARTED)
  })

  it('ends a vacation whose end is this instant', () => {
    const held = holding(Vacation.Active({ start: daysFromNow(-7), end: now }))

    expect(seen(Result.succeed(advance(held, now)))).toEqual(ENDED)
  })

  it('starts a due vacation with the range it was scheduled with', () => {
    const decided = advance(scheduledDue, now)

    expect(decided.writes[0]).toEqual(
      VacationWrite.SetVacation({
        userId: 'alex',
        expected: scheduledDue.stored,
        next: Vacation.Active(startedAlready),
      })
    )
  })

  it('keeps the start of a running vacation and takes the end asked for', () => {
    const newEnd = daysFromNow(20)

    const decided = Result.getOrThrow(
      request(running, { start: startedAlready.start, end: newEnd }, now)
    )

    expect(decided.outcome.vacation).toEqual(
      Vacation.Active({ start: startedAlready.start, end: newEnd })
    )
  })

  it('ends a vacation called off at the instant of the call, moving due days before it clears the row and sweeps', () => {
    const decided = Result.getOrThrow(callOff(running, now))

    expect(decided.writes).toEqual([
      VacationWrite.MoveDueDaysAfterAbsence({
        userId: 'alex',
        endedAt: now,
        days: 3,
      }),
      VacationWrite.SetVacation({
        userId: 'alex',
        expected: running.stored,
        next: Vacation.None(),
      }),
      VacationWrite.SweepMuted({ userId: 'alex' }),
    ])
    expect(decided.events).toEqual([
      {
        _tag: 'VacationEnded',
        userId: 'alex',
        start: DateTime.toDateUtc(startedAlready.start),
        endedAt: DateTime.toDateUtc(now),
      },
    ])
  })

  it('ends a vacation that ran out at its stored end, not at the tick', () => {
    const decided = advance(ranOut, now)

    expect(decided.writes[0]).toEqual(
      VacationWrite.MoveDueDaysAfterAbsence({
        userId: 'alex',
        endedAt: over.end,
        days: 7,
      })
    )
    expect(decided.events).toEqual([
      {
        _tag: 'VacationEnded',
        userId: 'alex',
        start: DateTime.toDateUtc(over.start),
        endedAt: DateTime.toDateUtc(over.end),
      },
    ])
  })

  it('discards the vacation of a deleted account at the instant of the deletion', () => {
    const decided = discardForDeletedAccount(ranOut, now)

    expect(decided.events).toEqual([
      {
        _tag: 'VacationEnded',
        userId: 'alex',
        start: DateTime.toDateUtc(over.start),
        endedAt: DateTime.toDateUtc(now),
      },
    ])
  })
})

describe('a range asked for', () => {
  const longest = { days: VACATION_MAX_DURATION_DAYS }

  it.each<readonly [string, Away, BadRange]>([
    [
      'an end before its start',
      { start: daysFromNow(5), end: daysFromNow(2) },
      'EndNotAfterStart',
    ],
    [
      'an end at its start',
      { start: daysFromNow(5), end: daysFromNow(5) },
      'EndNotAfterStart',
    ],
    [
      'an end before its start, both past',
      { start: daysFromNow(-2), end: daysFromNow(-5) },
      'EndNotAfterStart',
    ],
    [
      'an end already past',
      { start: daysFromNow(-5), end: daysFromNow(-2) },
      'EndInPast',
    ],
    [
      'an end at this instant',
      { start: daysFromNow(-5), end: now },
      'EndInPast',
    ],
    [
      'an end past, too long as well',
      {
        start: DateTime.subtract(now, { days: 400 }),
        end: daysFromNow(-1),
      },
      'EndInPast',
    ],
    [
      'one millisecond over the longest stay',
      {
        start: daysFromNow(1),
        end: DateTime.add(DateTime.add(daysFromNow(1), longest), {
          milliseconds: 1,
        }),
      },
      'TooLong',
    ],
  ])('is refused for %s', (_what, asked, why) => {
    expect(request(nothing, asked, now)).toEqual(
      Result.fail(VacationRefusal.BadRange({ why }))
    )
  })

  it('is taken at exactly the longest stay', () => {
    const asked = {
      start: daysFromNow(1),
      end: DateTime.add(daysFromNow(1), longest),
    }

    expect(seen(request(nothing, asked, now))).toEqual(SCHEDULED)
  })

  it('is refused for its length before its start is compared with a running vacation', () => {
    const asked = {
      start: daysFromNow(-1),
      end: DateTime.add(daysFromNow(1), longest),
    }

    expect(request(running, asked, now)).toEqual(
      Result.fail(VacationRefusal.BadRange({ why: 'TooLong' }))
    )
  })

  it('is refused on a running vacation for another start', () => {
    expect(
      request(running, { start: daysFromNow(-1), end: daysFromNow(20) }, now)
    ).toEqual(
      Result.fail(VacationRefusal.BadRange({ why: 'StartOfActiveChanged' }))
    )
  })
})

describe('vacationOf', () => {
  const start = daysFromNow(-3)
  const end = daysFromNow(4)
  const some = Option.some
  const none = Option.none<DateTime.Utc>()

  it.each<readonly [string, StoredVacation, Vacation]>([
    [
      'none, stray dates ignored',
      { status: 'none', start: some(start), end: some(end) },
      Vacation.None(),
    ],
    [
      'scheduled with both dates',
      { status: 'scheduled', start: some(start), end: some(end) },
      Vacation.Scheduled({ start, end }),
    ],
    [
      'scheduled with its start missing',
      { status: 'scheduled', start: none, end: some(end) },
      Vacation.None(),
    ],
    [
      'scheduled with its end missing',
      { status: 'scheduled', start: some(start), end: none },
      Vacation.None(),
    ],
    [
      'active with both dates',
      { status: 'active', start: some(start), end: some(end) },
      Vacation.Active({ start, end }),
    ],
    [
      'active with its start missing',
      { status: 'active', start: none, end: some(end) },
      Vacation.Active({ start: end, end }),
    ],
    [
      'active with its end missing',
      { status: 'active', start: some(start), end: none },
      Vacation.Active({ start, end: now }),
    ],
    [
      'active with both dates missing',
      { status: 'active', start: none, end: none },
      Vacation.Active({ start: now, end: now }),
    ],
  ])('reads a row that is %s', (_shape, stored, vacation) => {
    expect(vacationOf(stored, now)).toEqual(vacation)
  })

  it('ends a running row without a start as zero days away', () => {
    const legacy: StoredVacation = {
      status: 'active',
      start: none,
      end: some(daysFromNow(-2)),
    }
    const held: Held = {
      userId: 'alex',
      timezone: 'UTC',
      stored: legacy,
      vacation: vacationOf(legacy, now),
    }

    expect(advance(held, now).writes[0]).toEqual(
      VacationWrite.MoveDueDaysAfterAbsence({
        userId: 'alex',
        endedAt: daysFromNow(-2),
        days: 0,
      })
    )
  })
})

describe('daysAway', () => {
  const at = (iso: string) => DateTime.makeUnsafe(iso)
  const away = (start: string): Away => ({
    start: at(start),
    end: at('2030-01-01T00:00:00Z'),
  })

  it.each([
    [
      'whole days in the timezone of the user',
      '2026-08-09T22:30:00Z',
      '2026-08-17T06:00:00Z',
      'Europe/Paris',
      7,
    ],
    [
      'up to the day it ended in the timezone of the user',
      '2026-08-10T12:00:00Z',
      '2026-08-16T22:30:00Z',
      'Europe/Paris',
      7,
    ],
    [
      'whole days in UTC for the same instants',
      '2026-08-09T22:30:00Z',
      '2026-08-17T06:00:00Z',
      'UTC',
      8,
    ],
    [
      'across the hour gained when summer time ends',
      '2026-10-21T10:00:00Z',
      '2026-10-27T10:00:00Z',
      'Europe/Paris',
      6,
    ],
    [
      'across the hour lost when summer time starts',
      '2026-03-25T10:00:00Z',
      '2026-04-01T10:00:00Z',
      'Europe/Paris',
      7,
    ],
    [
      'nothing for a start and an end on one day',
      '2026-08-17T01:00:00Z',
      '2026-08-17T23:00:00Z',
      'UTC',
      0,
    ],
    [
      'nothing for a start after the end',
      '2026-08-20T00:00:00Z',
      '2026-08-17T06:00:00Z',
      'UTC',
      0,
    ],
  ] as const)('counts %s', (_what, start, endedAt, timezone, days) => {
    expect(daysAway(away(start), at(endedAt), timezone)).toBe(days)
  })
})

describe('the account a vacation command holds', () => {
  const account = {
    id: 'alex',
    timezone: 'Europe/Paris',
    ...vacationColumnsOf(Vacation.Scheduled(ahead)),
  }

  const NOT_ACTIVE = {
    suspended: true,
    banned: true,
    pending_deletion: true,
  } satisfies Record<Exclude<UserStatus, 'active'>, true>

  it.each(Struct.keys(NOT_ACTIVE))('is none for a %s account', (status) => {
    expect(heldVacationOf({ ...account, status }, now)).toEqual(Option.none())
  })

  it('is the vacation of an active account, parsed once', () => {
    expect(heldVacationOf({ ...account, status: 'active' }, now)).toEqual(
      Option.some({
        userId: 'alex',
        timezone: 'Europe/Paris',
        stored: storedAs(Vacation.Scheduled(ahead)),
        vacation: Vacation.Scheduled(ahead),
      })
    )
  })

  it('counts days in UTC for an account without a timezone', () => {
    expect(
      Option.map(
        heldVacationOf({ ...account, status: 'active', timezone: null }, now),
        (held) => held.timezone
      )
    ).toEqual(Option.some('UTC'))
  })

  it.each([
    Vacation.None(),
    Vacation.Scheduled(ahead),
    Vacation.Active(startedAlready),
  ])(
    'stores $_tag in columns that read back as the same vacation',
    (vacation) => {
      expect(vacationOf(storedAs(vacation), now)).toEqual(vacation)
    }
  )

  it('stores no date for no vacation', () => {
    expect(vacationColumnsOf(Vacation.None())).toEqual({
      vacationStatus: 'none',
      vacationStart: null,
      vacationEnd: null,
    })
  })
})

describe('the errors a vacation refusal answers with', () => {
  const RANGE_MESSAGES = {
    EndNotAfterStart: 'End date must be after start date',
    EndInPast: 'End date must be in the future',
    TooLong: 'Vacation cannot be longer than 365 days',
    StartOfActiveChanged: 'Cannot change the start date of an active vacation',
  } satisfies Record<BadRange, string>

  it.each(Struct.keys(RANGE_MESSAGES))(
    'a range refused as %s is a date error that says why',
    (why) => {
      const error = asSetVacationError(VacationRefusal.BadRange({ why }))

      expect(error).toBeInstanceOf(VacationDateError)
      expect(error.message).toBe(RANGE_MESSAGES[why])
    }
  )

  it('a missing account is a user that is not found, for a set and for a cancel', () => {
    expect(asSetVacationError(VacationRefusal.NoAccount())).toBeInstanceOf(
      UserNotFoundError
    )
    expect(asCancelVacationError(VacationRefusal.NoAccount())).toBeInstanceOf(
      UserNotFoundError
    )
  })

  it('a cancel with nothing to cancel is a vacation that is not found', () => {
    expect(asCancelVacationError(VacationRefusal.NoVacation())).toBeInstanceOf(
      VacationNotFoundError
    )
  })
})
