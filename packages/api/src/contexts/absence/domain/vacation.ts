import type { AbsenceEvent } from '@lily/api/contexts/absence/domain/events'
import {
  decision,
  type Decision as KernelDecision,
} from '@lily/api/kernel/transact'
import {
  startOfDay,
  VACATION_MAX_DURATION_DAYS,
  type VacationStatus,
} from '@lily/shared'
import {
  Array,
  Data,
  DateTime,
  Duration,
  Match,
  Option,
  pipe,
  Result,
} from 'effect'

export interface Away {
  readonly start: DateTime.Utc
  readonly end: DateTime.Utc
}

export type Vacation = Data.TaggedEnum<{
  None: Record<never, never>
  Scheduled: Away
  Active: Away
}>
export const Vacation = Data.taggedEnum<Vacation>()
export type VacationState = Vacation['_tag']

export interface StoredVacation {
  readonly status: VacationStatus
  readonly start: Option.Option<DateTime.Utc>
  readonly end: Option.Option<DateTime.Utc>
}

const awayBetween = (
  stored: StoredVacation,
  missing: { readonly start: DateTime.Utc; readonly end: DateTime.Utc }
): Away => ({
  start: Option.getOrElse(stored.start, () => missing.start),
  end: Option.getOrElse(stored.end, () => missing.end),
})

const READ_AS = {
  none: () => Vacation.None(),
  scheduled: (stored) =>
    Option.match(Option.all({ start: stored.start, end: stored.end }), {
      onNone: () => Vacation.None(),
      onSome: (away) => Vacation.Scheduled(away),
    }),
  active: (stored, now) =>
    Vacation.Active(
      awayBetween(stored, {
        start: Option.getOrElse(stored.end, () => now),
        end: now,
      })
    ),
} satisfies Record<
  VacationStatus,
  (stored: StoredVacation, now: DateTime.Utc) => Vacation
>

export const vacationOf = (
  stored: StoredVacation,
  now: DateTime.Utc
): Vacation => READ_AS[stored.status](stored, now)

export type EndsAt = 'Now' | 'StoredEnd'
export type EndsWhen = 'Always' | 'OnceEndPassed'

export type Rule = Data.TaggedEnum<{
  Stay: Record<never, never>
  Refuse: Record<never, never>
  Take: Record<never, never>
  Extend: Record<never, never>
  Clear: Record<never, never>
  StartOnceDue: Record<never, never>
  End: {
    readonly at: EndsAt
    readonly when: EndsWhen
    readonly shiftsDueDays: boolean
  }
}>
export const Rule = Data.taggedEnum<Rule>()

type RuleOf<T extends Rule['_tag']> = Extract<Rule, { readonly _tag: T }>
type AnsweringARequest = RuleOf<'Take' | 'Extend'>
type OnWhatIsHeld = RuleOf<'Stay' | 'Refuse' | 'Clear' | 'StartOnceDue' | 'End'>
type NeverRefused = Exclude<OnWhatIsHeld, RuleOf<'Refuse'>>

const stay: RuleOf<'Stay'> = Rule.Stay()
const refuse: RuleOf<'Refuse'> = Rule.Refuse()
const take: RuleOf<'Take'> = Rule.Take()
const extend: RuleOf<'Extend'> = Rule.Extend()
const clear: RuleOf<'Clear'> = Rule.Clear()
const startOnceDue: RuleOf<'StartOnceDue'> = Rule.StartOnceDue()
const end = (how: Omit<RuleOf<'End'>, '_tag'>): RuleOf<'End'> => ({
  _tag: 'End',
  ...how,
})

export const RULES = {
  Set: { None: take, Scheduled: take, Active: extend },
  Cancel: {
    None: refuse,
    Scheduled: clear,
    Active: end({ at: 'Now', when: 'Always', shiftsDueDays: true }),
  },
  Advance: {
    None: stay,
    Scheduled: startOnceDue,
    Active: end({
      at: 'StoredEnd',
      when: 'OnceEndPassed',
      shiftsDueDays: true,
    }),
  },
  DiscardForDeletedAccount: {
    None: stay,
    Scheduled: clear,
    Active: end({ at: 'Now', when: 'Always', shiftsDueDays: false }),
  },
} as const satisfies {
  readonly Set: Record<VacationState, AnsweringARequest>
  readonly Cancel: Record<VacationState, OnWhatIsHeld>
  readonly Advance: Record<VacationState, NeverRefused>
  readonly DiscardForDeletedAccount: Record<VacationState, NeverRefused>
}

export type VacationWrite = Data.TaggedEnum<{
  MoveDueDaysAfterAbsence: {
    readonly userId: string
    readonly endedAt: DateTime.Utc
    readonly days: number
  }
  SetVacation: {
    readonly userId: string
    readonly expected: StoredVacation
    readonly next: Vacation
  }
  SweepMuted: { readonly userId: string }
}>
export const VacationWrite = Data.taggedEnum<VacationWrite>()

export type Decision<A> = KernelDecision<VacationWrite, AbsenceEvent, A>

export type BadRange =
  | 'EndNotAfterStart'
  | 'EndInPast'
  | 'TooLong'
  | 'StartOfActiveChanged'

export type VacationRefusal = Data.TaggedEnum<{
  NoAccount: Record<never, never>
  NoVacation: Record<never, never>
  BadRange: { readonly why: BadRange }
}>
export const VacationRefusal = Data.taggedEnum<VacationRefusal>()

export type RefusalOf<T extends VacationRefusal['_tag']> = Extract<
  VacationRefusal,
  { readonly _tag: T }
>

export interface After {
  readonly vacation: Vacation
  readonly changed: boolean
}

export interface Held {
  readonly userId: string
  readonly timezone: string
  readonly vacation: Vacation
  readonly stored: StoredVacation
}

const DAY_MS = Duration.toMillis(Duration.days(1))

export const daysAway = (
  away: Away,
  endedAt: DateTime.Utc,
  timezone: string
): number =>
  Math.max(
    0,
    Math.round(
      (DateTime.toEpochMillis(startOfDay(endedAt, timezone)) -
        DateTime.toEpochMillis(startOfDay(away.start, timezone))) /
        DAY_MS
    )
  )

const sameInstant = (first: DateTime.Utc, second: DateTime.Utc) =>
  DateTime.toEpochMillis(first) === DateTime.toEpochMillis(second)

const REFUSED_FOR_ITS_RANGE: ReadonlyArray<
  readonly [BadRange, (requested: Away, now: DateTime.Utc) => boolean]
> = [
  [
    'EndNotAfterStart',
    (requested) =>
      DateTime.isGreaterThanOrEqualTo(requested.start, requested.end),
  ],
  [
    'EndInPast',
    (requested, now) => DateTime.isLessThanOrEqualTo(requested.end, now),
  ],
  [
    'TooLong',
    (requested) =>
      DateTime.toEpochMillis(requested.end) -
        DateTime.toEpochMillis(requested.start) >
      Duration.toMillis(Duration.days(VACATION_MAX_DURATION_DAYS)),
  ],
]

const inRange = (
  requested: Away,
  now: DateTime.Utc
): Result.Result<Away, RefusalOf<'BadRange'>> =>
  pipe(
    Array.findFirst(REFUSED_FOR_ITS_RANGE, ([, refused]) =>
      refused(requested, now)
    ),
    Option.match({
      onNone: () => Result.succeed(requested),
      onSome: ([why]) => Result.fail(VacationRefusal.BadRange({ why })),
    })
  )

const unchanged = (held: Held): Decision<After> =>
  decision({ vacation: held.vacation, changed: false })

const becoming = (held: Held, next: Vacation) =>
  VacationWrite.SetVacation({
    userId: held.userId,
    expected: held.stored,
    next,
  })

const kept = (held: Held, next: Vacation): Decision<After> =>
  decision({ vacation: next, changed: true }, [becoming(held, next)])

const started = (held: Held, away: Away): Decision<After> =>
  decision(
    { vacation: Vacation.Active(away), changed: true },
    [
      becoming(held, Vacation.Active(away)),
      VacationWrite.SweepMuted({ userId: held.userId }),
    ],
    [{ _tag: 'VacationStarted', userId: held.userId }]
  )

const ended = (
  held: Held,
  away: Away,
  endedAt: DateTime.Utc,
  shiftsDueDays: boolean
): Decision<After> =>
  decision(
    { vacation: Vacation.None(), changed: true },
    [
      ...(shiftsDueDays
        ? [
            VacationWrite.MoveDueDaysAfterAbsence({
              userId: held.userId,
              endedAt,
              days: daysAway(away, endedAt, held.timezone),
            }),
          ]
        : []),
      becoming(held, Vacation.None()),
      VacationWrite.SweepMuted({ userId: held.userId }),
    ],
    [
      {
        _tag: 'VacationEnded',
        userId: held.userId,
        start: DateTime.toDateUtc(away.start),
        endedAt: DateTime.toDateUtc(endedAt),
      },
    ]
  )

const hasStarted = (away: Away, now: DateTime.Utc) =>
  DateTime.isLessThanOrEqualTo(away.start, now)

const ENDED_AT = {
  Now: (_, now) => now,
  StoredEnd: (away) => away.end,
} satisfies Record<EndsAt, (away: Away, now: DateTime.Utc) => DateTime.Utc>

const IS_OVER = {
  Always: () => true,
  OnceEndPassed: (away, now) => DateTime.isLessThanOrEqualTo(away.end, now),
} satisfies Record<EndsWhen, (away: Away, now: DateTime.Utc) => boolean>

const whileAway = (
  held: Held,
  then: (away: Away) => Decision<After>
): Decision<After> =>
  Vacation.$match(held.vacation, {
    None: () => unchanged(held),
    Scheduled: then,
    Active: then,
  })

const whileRunning = <R>(
  held: Held,
  then: (away: Away) => Result.Result<Decision<After>, R>
): Result.Result<Decision<After>, R> =>
  Vacation.$match(held.vacation, {
    None: () => Result.succeed(unchanged(held)),
    Scheduled: () => Result.succeed(unchanged(held)),
    Active: then,
  })

const answered = (
  rule: AnsweringARequest,
  held: Held,
  requested: Away,
  now: DateTime.Utc
): Result.Result<Decision<After>, RefusalOf<'BadRange'>> =>
  Match.value(rule).pipe(
    Match.tagsExhaustive({
      Take: () =>
        Result.succeed(
          hasStarted(requested, now)
            ? started(held, requested)
            : kept(held, Vacation.Scheduled(requested))
        ),
      Extend: () =>
        whileRunning(held, (away) =>
          sameInstant(away.start, requested.start)
            ? Result.succeed(
                kept(
                  held,
                  Vacation.Active({ start: away.start, end: requested.end })
                )
              )
            : Result.fail(
                VacationRefusal.BadRange({ why: 'StartOfActiveChanged' })
              )
        ),
    })
  )

const advanced = (
  rule: NeverRefused,
  held: Held,
  now: DateTime.Utc
): Decision<After> =>
  Match.value(rule).pipe(
    Match.tagsExhaustive({
      Stay: () => unchanged(held),
      Clear: () => kept(held, Vacation.None()),
      StartOnceDue: () =>
        whileAway(held, (away) =>
          hasStarted(away, now) ? started(held, away) : unchanged(held)
        ),
      End: ({ at, when, shiftsDueDays }) =>
        whileAway(held, (away) =>
          IS_OVER[when](away, now)
            ? ended(held, away, ENDED_AT[at](away, now), shiftsDueDays)
            : unchanged(held)
        ),
    })
  )

const followed = (
  rule: OnWhatIsHeld,
  held: Held,
  now: DateTime.Utc
): Result.Result<Decision<After>, RefusalOf<'NoVacation'>> =>
  rule._tag === 'Refuse'
    ? Result.fail(VacationRefusal.NoVacation())
    : Result.succeed(advanced(rule, held, now))

export const request = (held: Held, asked: Away, now: DateTime.Utc) =>
  Result.flatMap(inRange(asked, now), (requested) =>
    answered(RULES.Set[held.vacation._tag], held, requested, now)
  )

export const callOff = (held: Held, now: DateTime.Utc) =>
  followed(RULES.Cancel[held.vacation._tag], held, now)

export const advance = (held: Held, now: DateTime.Utc) =>
  advanced(RULES.Advance[held.vacation._tag], held, now)

export const discardForDeletedAccount = (held: Held, now: DateTime.Utc) =>
  advanced(RULES.DiscardForDeletedAccount[held.vacation._tag], held, now)
