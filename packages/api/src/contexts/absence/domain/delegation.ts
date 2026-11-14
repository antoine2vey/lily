import type {
  AbsenceEvent,
  DelegationEndReason,
} from '@lily/api/contexts/absence/domain/events'
import {
  decision,
  type Decision as KernelDecision,
} from '@lily/api/kernel/transact'
import type { LanguageCode, PlantOwner } from '@lily/shared'
import { Array, Data, DateTime, Match, Option, pipe, Result } from 'effect'

export interface Party {
  readonly id: string
  readonly name: Option.Option<string>
  readonly language: LanguageCode
}

export type Role = 'owner' | 'caretaker'

export interface DelegatedPlant {
  readonly id: string
  readonly living: boolean
}

export interface Terms extends Readonly<Record<Role, Party>> {
  readonly id: string
  readonly start: DateTime.Utc
  readonly end: DateTime.Utc
  readonly plants: ReadonlyArray<DelegatedPlant>
}

export type Delegation = Data.TaggedEnum<{
  Pending: Terms
  Accepted: Terms
  Active: Terms
  Rejected: Terms
  Canceled: Terms
  Completed: Terms
}>
export const Delegation = Data.taggedEnum<Delegation>()
export type Status = Delegation['_tag']

export type DelegationCommand = Data.TaggedEnum<{
  Accept: { readonly by: string }
  Decline: { readonly by: string }
  Cancel: { readonly by: string }
  CompleteEarly: { readonly by: string }
  Advance: Record<never, never>
  ReleaseForDeletedAccount: Record<never, never>
}>
export const DelegationCommand = Data.taggedEnum<DelegationCommand>()

export type UserCommand = Extract<DelegationCommand, { readonly by: string }>

export const MAY = {
  Accept: 'caretaker',
  Decline: 'caretaker',
  Cancel: 'owner',
  CompleteEarly: 'owner',
} as const satisfies Record<UserCommand['_tag'], Role>

export type NoticeKind =
  | 'Requested'
  | 'Accepted'
  | 'Declined'
  | 'CalledOff'
  | 'Lapsed'
  | 'Began'
  | 'Finished'

export const TOLD = {
  Requested: ['caretaker'],
  Accepted: ['owner'],
  Declined: ['owner'],
  CalledOff: ['caretaker'],
  Lapsed: ['owner'],
  Began: ['owner', 'caretaker'],
  Finished: ['owner', 'caretaker'],
} as const satisfies Record<NoticeKind, ReadonlyArray<Role>>

const OTHER_PARTY = {
  owner: 'caretaker',
  caretaker: 'owner',
} as const satisfies Record<Role, Role>

export interface Notice {
  readonly kind: NoticeKind
  readonly to: Party
  readonly from: Party
  readonly delegationId: string
  readonly livingPlants: number
}

export interface Noticed<A> {
  readonly value: A
  readonly notices: ReadonlyArray<Notice>
}

export type Handover = Data.TaggedEnum<{
  None: Record<never, never>
  Started: Record<never, never>
  Ended: { readonly reason: DelegationEndReason }
}>
export const Handover = Data.taggedEnum<Handover>()

export type Due = 'Always' | 'OnceStartPassed' | 'OnceEndPassed'

export type Rule = Data.TaggedEnum<{
  Stay: Record<never, never>
  Refuse: Record<never, never>
  Move: {
    readonly to: Exclude<Status, 'Pending'>
    readonly due: Due
    readonly handover: Handover
    readonly tell: ReadonlyArray<NoticeKind>
  }
}>
export const Rule = Data.taggedEnum<Rule>()

type Stay = Extract<Rule, { readonly _tag: 'Stay' }>
type Refuse = Extract<Rule, { readonly _tag: 'Refuse' }>
type Move = Extract<Rule, { readonly _tag: 'Move' }>
type NeverRefused = Stay | Move

const stay: Stay = Rule.Stay()
const refuse: Refuse = Rule.Refuse()
const move = (
  to: Move['to'],
  rest: Partial<Omit<Move, '_tag' | 'to'>> = {}
): Move => ({
  _tag: 'Move',
  to,
  due: 'Always',
  handover: Handover.None(),
  tell: [],
  ...rest,
})
const ended = (reason: DelegationEndReason) => Handover.Ended({ reason })

export const RULES = {
  Accept: {
    Pending: move('Accepted', { tell: ['Accepted'] }),
    Accepted: refuse,
    Active: refuse,
    Rejected: refuse,
    Canceled: refuse,
    Completed: refuse,
  },
  Decline: {
    Pending: move('Rejected', { tell: ['Declined'] }),
    Accepted: refuse,
    Active: refuse,
    Rejected: refuse,
    Canceled: refuse,
    Completed: refuse,
  },
  Cancel: {
    Pending: move('Canceled', { tell: ['CalledOff'] }),
    Accepted: move('Canceled', { tell: ['CalledOff'] }),
    Active: move('Canceled', {
      handover: ended('canceled'),
      tell: ['CalledOff'],
    }),
    Rejected: refuse,
    Canceled: refuse,
    Completed: refuse,
  },
  CompleteEarly: {
    Pending: refuse,
    Accepted: refuse,
    Active: move('Completed', { handover: ended('completedEarly') }),
    Rejected: refuse,
    Canceled: refuse,
    Completed: refuse,
  },
  Advance: {
    Pending: move('Canceled', { due: 'OnceStartPassed', tell: ['Lapsed'] }),
    Accepted: move('Active', {
      due: 'OnceStartPassed',
      handover: Handover.Started(),
      tell: ['Began'],
    }),
    Active: move('Completed', {
      due: 'OnceEndPassed',
      handover: ended('completed'),
      tell: ['Finished'],
    }),
    Rejected: stay,
    Canceled: stay,
    Completed: stay,
  },
  ReleaseForDeletedAccount: {
    Pending: move('Canceled'),
    Accepted: move('Canceled'),
    Active: move('Canceled', { handover: ended('accountDeleted') }),
    Rejected: stay,
    Canceled: stay,
    Completed: stay,
  },
} as const satisfies {
  readonly [C in DelegationCommand['_tag']]: Record<
    Status,
    C extends UserCommand['_tag'] ? Rule : NeverRefused
  >
}

export type DelegationWrite = Data.TaggedEnum<{
  OpenDelegation: {
    readonly id: string
    readonly ownerId: string
    readonly caretakerId: string
    readonly start: DateTime.Utc
    readonly end: DateTime.Utc
    readonly message: Option.Option<string>
    readonly plantIds: ReadonlyArray<string>
  }
  MoveDelegation: {
    readonly id: string
    readonly from: Status
    readonly to: Status
    readonly at: DateTime.Utc
  }
}>
export const DelegationWrite = Data.taggedEnum<DelegationWrite>()

export type Decision<A> = KernelDecision<DelegationWrite, AbsenceEvent, A>

export type DelegationRefusal = Data.TaggedEnum<{
  Gone: { readonly delegationId: string }
  NotAllowed: { readonly command: UserCommand['_tag'] }
  WrongStatus: {
    readonly command: UserCommand['_tag']
    readonly current: Status
  }
}>
export const DelegationRefusal = Data.taggedEnum<DelegationRefusal>()

const IS_DUE = {
  Always: () => true,
  OnceStartPassed: (terms, now) =>
    DateTime.isLessThanOrEqualTo(terms.start, now),
  OnceEndPassed: (terms, now) => DateTime.isLessThanOrEqualTo(terms.end, now),
} satisfies Record<Due, (terms: Terms, now: DateTime.Utc) => boolean>

const noticesOf = (
  kinds: ReadonlyArray<NoticeKind>,
  terms: Terms
): ReadonlyArray<Notice> =>
  Array.flatMap(kinds, (kind) =>
    Array.map(TOLD[kind], (role) => ({
      kind,
      to: terms[role],
      from: terms[OTHER_PARTY[role]],
      delegationId: terms.id,
      livingPlants: Array.filter(terms.plants, (plant) => plant.living).length,
    }))
  )

const factsOf = (
  handover: Handover,
  terms: Terms
): ReadonlyArray<AbsenceEvent> => {
  const handedOver = {
    delegationId: terms.id,
    ownerId: terms.owner.id,
    caretakerId: terms.caretaker.id,
    plantIds: Array.map(terms.plants, (plant) => plant.id),
  }
  return Handover.$match(handover, {
    None: (): ReadonlyArray<AbsenceEvent> => [],
    Started: (): ReadonlyArray<AbsenceEvent> => [
      { _tag: 'DelegationStarted', ...handedOver },
    ],
    Ended: ({ reason }): ReadonlyArray<AbsenceEvent> => [
      { _tag: 'DelegationEnded', ...handedOver, reason },
    ],
  })
}

export type Moved = Noticed<Option.Option<Status>>

const stayed: Decision<Moved> = decision({ value: Option.none(), notices: [] })

const followed = (
  rule: NeverRefused,
  state: Delegation,
  now: DateTime.Utc
): Decision<Moved> =>
  Match.value(rule).pipe(
    Match.tagsExhaustive({
      Stay: () => stayed,
      Move: ({ to, due, handover, tell }) =>
        IS_DUE[due](state, now)
          ? decision(
              { value: Option.some(to), notices: noticesOf(tell, state) },
              [
                DelegationWrite.MoveDelegation({
                  id: state.id,
                  from: state._tag,
                  to,
                  at: now,
                }),
              ],
              factsOf(handover, state)
            )
          : stayed,
    })
  )

const asked = (
  state: Delegation,
  command: UserCommand,
  now: DateTime.Utc
): Result.Result<Decision<Moved>, DelegationRefusal> =>
  state[MAY[command._tag]].id === command.by
    ? Match.value<Rule>(RULES[command._tag][state._tag]).pipe(
        Match.tagsExhaustive({
          Refuse: () =>
            Result.fail(
              DelegationRefusal.WrongStatus({
                command: command._tag,
                current: state._tag,
              })
            ),
          Stay: (rule) => Result.succeed(followed(rule, state, now)),
          Move: (rule) => Result.succeed(followed(rule, state, now)),
        })
      )
    : Result.fail(DelegationRefusal.NotAllowed({ command: command._tag }))

export const transition = (
  state: Delegation,
  command: DelegationCommand,
  now: DateTime.Utc
): Result.Result<Decision<Moved>, DelegationRefusal> =>
  'by' in command
    ? asked(state, command, now)
    : Result.succeed(followed(RULES[command._tag][state._tag], state, now))

export const releaseForDeletedAccount = (
  state: Delegation,
  now: DateTime.Utc
): Decision<Moved> =>
  followed(RULES.ReleaseForDeletedAccount[state._tag], state, now)

export interface OpenRequest {
  readonly by: string
  readonly caretakerId: string
  readonly start: DateTime.Utc
  readonly end: DateTime.Utc
  readonly message: Option.Option<string>
  readonly plantIds: ReadonlyArray<string>
}

export interface RequestedPlant extends DelegatedPlant {
  readonly owner: PlantOwner
}

export interface OpenFacts {
  readonly owner: Party
  readonly caretaker: Option.Option<Party>
  readonly plants: ReadonlyArray<RequestedPlant>
  readonly canopyOfCaller: Option.Option<string>
  readonly overlapping: ReadonlyArray<string>
}

export type OpenRefusal = Data.TaggedEnum<{
  Self: Record<never, never>
  CaretakerUnknown: { readonly caretakerId: string }
  StartInPast: Record<never, never>
  EndNotAfterStart: Record<never, never>
  NoPlants: Record<never, never>
  CanopyPlant: { readonly plantId: string }
  NotOwner: Record<never, never>
  Overlap: { readonly plantIds: ReadonlyArray<string> }
}>
export const OpenRefusal = Data.taggedEnum<OpenRefusal>()

type OpeningCheck = (
  facts: OpenFacts,
  request: OpenRequest,
  now: DateTime.Utc
) => Option.Option<OpenRefusal>

const refuseWhen = (
  refused: boolean,
  refusal: () => OpenRefusal
): Option.Option<OpenRefusal> =>
  refused ? Option.some(refusal()) : Option.none()

const isPersonalPlantOf = (plant: RequestedPlant, userId: string) =>
  plant.owner._tag === 'User' && plant.owner.userId === userId

const isInCanopy = (plant: RequestedPlant, canopyId: Option.Option<string>) =>
  plant.owner._tag === 'Canopy' &&
  Option.contains(canopyId, plant.owner.canopyId)

const CHECKED_AFTER_THE_CARETAKER: ReadonlyArray<OpeningCheck> = [
  (_, request, now) =>
    refuseWhen(
      DateTime.isLessThan(request.start, now),
      OpenRefusal.StartInPast
    ),
  (_, request) =>
    refuseWhen(
      DateTime.isLessThanOrEqualTo(request.end, request.start),
      OpenRefusal.EndNotAfterStart
    ),
  (_, request) =>
    refuseWhen(
      Array.isReadonlyArrayEmpty(request.plantIds),
      OpenRefusal.NoPlants
    ),
  (facts) =>
    Option.map(
      Array.findFirst(facts.plants, (plant) =>
        isInCanopy(plant, facts.canopyOfCaller)
      ),
      (plant) => OpenRefusal.CanopyPlant({ plantId: plant.id })
    ),
  (facts, request) =>
    refuseWhen(
      facts.plants.length !== request.plantIds.length ||
        !Array.every(facts.plants, (plant) =>
          isPersonalPlantOf(plant, request.by)
        ),
      OpenRefusal.NotOwner
    ),
  (facts) =>
    refuseWhen(Array.isReadonlyArrayNonEmpty(facts.overlapping), () =>
      OpenRefusal.Overlap({ plantIds: facts.overlapping })
    ),
]

export type Opened = Noticed<{ readonly delegationId: string }>

const opened = (
  terms: Terms,
  message: Option.Option<string>
): Decision<Opened> =>
  decision(
    {
      value: { delegationId: terms.id },
      notices: noticesOf(['Requested'], terms),
    },
    [
      DelegationWrite.OpenDelegation({
        id: terms.id,
        ownerId: terms.owner.id,
        caretakerId: terms.caretaker.id,
        start: terms.start,
        end: terms.end,
        message,
        plantIds: Array.map(terms.plants, (plant) => plant.id),
      }),
    ]
  )

export const open = (
  facts: OpenFacts,
  request: OpenRequest,
  env: { readonly now: DateTime.Utc; readonly newDelegationId: string }
): Result.Result<Decision<Opened>, OpenRefusal> =>
  request.by === request.caretakerId
    ? Result.fail(OpenRefusal.Self())
    : pipe(
        facts.caretaker,
        Result.fromOption(() =>
          OpenRefusal.CaretakerUnknown({ caretakerId: request.caretakerId })
        ),
        Result.flatMap((caretaker) =>
          Option.match(
            Array.findFirst(CHECKED_AFTER_THE_CARETAKER, (check) =>
              check(facts, request, env.now)
            ),
            {
              onSome: (refusal) => Result.fail(refusal),
              onNone: () =>
                Result.succeed(
                  opened(
                    {
                      id: env.newDelegationId,
                      owner: facts.owner,
                      caretaker,
                      start: request.start,
                      end: request.end,
                      plants: facts.plants,
                    },
                    request.message
                  )
                ),
            }
          )
        )
      )
