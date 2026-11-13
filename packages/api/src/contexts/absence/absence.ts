import {
  type Decision,
  DelegationCommand,
  DelegationRefusal,
  type Notice,
  type Noticed,
  type NoticeKind,
  OpenRefusal,
  type OpenRequest,
  open,
  releaseForDeletedAccount,
  transition,
  type UserCommand,
} from '@lily/api/contexts/absence/domain/delegation'
import {
  type AbsenceEvent,
  AbsenceTopic,
} from '@lily/api/contexts/absence/domain/events'
import {
  type After,
  advance,
  type BadRange,
  callOff,
  discardForDeletedAccount,
  type Held,
  request,
  type Vacation,
  type Decision as VacationDecision,
  VacationRefusal,
  type RefusalOf as VacationRefusalOf,
} from '@lily/api/contexts/absence/domain/vacation'
import {
  AbsenceStore,
  type AbsenceWrite,
  type Edge,
  type Releasable,
  statusOf,
} from '@lily/api/contexts/absence/store'
import type { Outbox } from '@lily/api/kernel/outbox'
import {
  commandBody,
  decision,
  type Decision as KernelDecision,
  Transaction,
  transact,
} from '@lily/api/kernel/transact'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  eachIsolated,
  type Tally,
} from '@lily/api/services/helpers/create-scheduler'
import {
  dispatchAll,
  type RecordedNotification,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import {
  CannotDelegateSelfError,
  CanopyPlantNotDelegableError,
  DelegationDateError,
  DelegationInvalidStatusError,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  DelegationOverlapError,
  UserNotFoundError,
  VACATION_MAX_DURATION_DAYS,
  VacationDateError,
  VacationNotFoundError,
} from '@lily/shared'
import { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import type { MessageQueue } from '@lily/shared/server'
import {
  Array,
  Context,
  DateTime,
  Effect,
  identity,
  Layer,
  Match,
  Option,
  pipe,
  Result,
} from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type OpenDelegationError =
  | CannotDelegateSelfError
  | UserNotFoundError
  | DelegationDateError
  | CanopyPlantNotDelegableError
  | PlantNotAuthorizedError
  | DelegationOverlapError

export type DelegationError =
  | DelegationNotFoundError
  | DelegationNotAuthorizedError
  | DelegationInvalidStatusError

export type SetVacationError = UserNotFoundError | VacationDateError

export type CancelVacationError = UserNotFoundError | VacationNotFoundError

interface OnDelegation {
  readonly by: string
  readonly delegationId: string
}

/**
 * The one way to change a delegation or a vacation. Each command takes its
 * locks, applies the rules, writes, records the notifications it owes and
 * publishes what happened, in one transaction.
 */
export class Absence extends Context.Service<
  Absence,
  {
    /**
     * The caller's own personal plants only. Whether the caller's plan
     * allows a delegation at all is the caller's to check first.
     */
    readonly openDelegation: (
      command: OpenRequest
    ) => Effect.Effect<{ readonly delegationId: string }, OpenDelegationError>
    /** The caretaker only, while the request is pending. */
    readonly respondToDelegation: (
      command: OnDelegation & { readonly accept: boolean }
    ) => Effect.Effect<void, DelegationError>
    /** The owner only, until the delegation is over. */
    readonly cancelDelegation: (
      command: OnDelegation
    ) => Effect.Effect<void, DelegationError>
    /** The owner only, while the delegation runs. */
    readonly completeDelegation: (
      command: OnDelegation
    ) => Effect.Effect<void, DelegationError>
    /**
     * One scheduler tick: starts every accepted delegation whose start has
     * passed, then completes every running one whose end has passed, each in
     * a transaction of its own. A delegation that fails or dies is counted
     * and left for the next tick. Fails only when the due list cannot be
     * read.
     */
    readonly advanceDelegations: Effect.Effect<Tally, SqlError>
    /**
     * A start that has already passed begins the vacation at once. A running
     * vacation keeps its start and only moves its end. Answers the vacation
     * the account holds afterwards.
     */
    readonly setVacation: (command: {
      readonly userId: string
      readonly start: DateTime.Utc
      readonly end: DateTime.Utc
    }) => Effect.Effect<Vacation, SetVacationError>
    /**
     * Calls a scheduled vacation off, or ends a running one now and moves
     * later the cares that came due while the user was away.
     */
    readonly cancelVacation: (command: {
      readonly userId: string
    }) => Effect.Effect<void, CancelVacationError>
    /**
     * One scheduler tick: starts every scheduled vacation whose start has
     * passed, then ends every running one whose end has passed, at its
     * stored end, each in a transaction of its own. A user whose vacation
     * fails or dies is counted and left for the next tick. Fails only when
     * the due list cannot be read.
     */
    readonly advanceVacations: Effect.Effect<Tally, SqlError>
    /**
     * Locks every delegation the user is a party to, then their account row.
     * An account deletion calls it before it touches a plant or a
     * notification, so it meets a vacation command or a settings change at
     * the account row and not behind it.
     */
    readonly holdForDeletion: (
      userId: string
    ) => Effect.Effect<void, SqlError, Transaction>
    /**
     * Cancels every open delegation of the user and ends their vacation.
     * Tells nobody and moves no due day. Keeps `SqlError` so the cleanup can
     * isolate one failing account.
     */
    readonly releaseForDeletion: (
      userId: string
    ) => Effect.Effect<void, SqlError, Transaction>
  }
>()('absence/Absence') {}

const ANSWERS = {
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
} satisfies Record<
  UserCommand['_tag'],
  {
    readonly notAllowed: string
    readonly expectedStatus: string
    readonly wrongStatus: string
  }
>

type RefusalOf<
  R extends { readonly _tag: string },
  T extends R['_tag'],
> = Extract<R, { readonly _tag: T }>

const delegationErrorOf = {
  Gone: ({ delegationId }) => new DelegationNotFoundError({ delegationId }),
  NotAllowed: ({ command }) =>
    new DelegationNotAuthorizedError({ message: ANSWERS[command].notAllowed }),
  WrongStatus: ({ command, current }) =>
    new DelegationInvalidStatusError({
      currentStatus: statusOf(current),
      expectedStatus: ANSWERS[command].expectedStatus,
      message: ANSWERS[command].wrongStatus,
    }),
} satisfies {
  readonly [T in DelegationRefusal['_tag']]: (
    refusal: RefusalOf<DelegationRefusal, T>
  ) => DelegationError
}

export const asDelegationError = Match.type<DelegationRefusal>().pipe(
  Match.tagsExhaustive(delegationErrorOf)
)

const openErrorOf = {
  Self: () => new CannotDelegateSelfError(),
  CaretakerUnknown: ({ caretakerId }) =>
    new UserNotFoundError({ userId: caretakerId }),
  StartInPast: () =>
    new DelegationDateError({ message: 'Start date must be in the future' }),
  EndNotAfterStart: () =>
    new DelegationDateError({ message: 'End date must be after start date' }),
  NoPlants: () =>
    new DelegationDateError({ message: 'At least one plant must be selected' }),
  CanopyPlant: ({ plantId }) => new CanopyPlantNotDelegableError({ plantId }),
  NotOwner: () => new PlantNotAuthorizedError(),
  Overlap: ({ plantIds }) => new DelegationOverlapError({ plantIds }),
} satisfies {
  readonly [T in OpenRefusal['_tag']]: (
    refusal: RefusalOf<OpenRefusal, T>
  ) => OpenDelegationError
}

export const asOpenError = Match.type<OpenRefusal>().pipe(
  Match.tagsExhaustive(openErrorOf)
)

const RANGE_ANSWERS = {
  EndNotAfterStart: 'End date must be after start date',
  EndInPast: 'End date must be in the future',
  TooLong: `Vacation cannot be longer than ${VACATION_MAX_DURATION_DAYS} days`,
  StartOfActiveChanged: 'Cannot change the start date of an active vacation',
} satisfies Record<BadRange, string>

const noAccount = () => new UserNotFoundError()

export const asSetVacationError = Match.type<
  VacationRefusalOf<'NoAccount' | 'BadRange'>
>().pipe(
  Match.tagsExhaustive({
    NoAccount: noAccount,
    BadRange: ({ why }) =>
      new VacationDateError({ message: RANGE_ANSWERS[why] }),
  })
)

export const asCancelVacationError = Match.type<
  VacationRefusalOf<'NoAccount' | 'NoVacation'>
>().pipe(
  Match.tagsExhaustive({
    NoAccount: noAccount,
    NoVacation: () => new VacationNotFoundError(),
  })
)

const signedBySender = (notice: Notice) => ({
  senderName: Option.getOrElse(notice.from.name, () => 'Someone'),
})

const countingLivingPlants = (notice: Notice) => ({
  plantCount: notice.livingPlants,
})

const aboutDelegation = (notice: Notice) => ({
  delegationId: notice.delegationId,
})

const record = {
  Requested: (notice) =>
    recordNotification(
      'delegation_request',
      notice.to.id,
      signedBySender(notice),
      notice.to.language,
      aboutDelegation(notice)
    ),
  Accepted: (notice) =>
    recordNotification(
      'delegation_accepted',
      notice.to.id,
      signedBySender(notice),
      notice.to.language,
      aboutDelegation(notice)
    ),
  Declined: (notice) =>
    recordNotification(
      'delegation_rejected',
      notice.to.id,
      signedBySender(notice),
      notice.to.language,
      aboutDelegation(notice)
    ),
  CalledOff: (notice) =>
    recordNotification(
      'delegation_canceled',
      notice.to.id,
      signedBySender(notice),
      notice.to.language,
      aboutDelegation(notice)
    ),
  Lapsed: (notice) =>
    recordNotification(
      'delegation_canceled',
      notice.to.id,
      { ...signedBySender(notice), unanswered: true },
      notice.to.language,
      aboutDelegation(notice)
    ),
  Began: (notice) =>
    recordNotification(
      'delegation_activated',
      notice.to.id,
      countingLivingPlants(notice),
      notice.to.language,
      aboutDelegation(notice)
    ),
  Finished: (notice) =>
    recordNotification(
      'delegation_completed',
      notice.to.id,
      countingLivingPlants(notice),
      notice.to.language,
      aboutDelegation(notice)
    ),
} satisfies Record<
  NoticeKind,
  (
    notice: Notice
  ) => Effect.Effect<RecordedNotification, SqlError, NotificationRepository>
>

export const releasedForDeletion = (
  { openDelegations, vacation }: Releasable,
  now: DateTime.Utc
): KernelDecision<AbsenceWrite, AbsenceEvent, void> => {
  const decided: ReadonlyArray<
    KernelDecision<AbsenceWrite, AbsenceEvent, unknown>
  > = [
    ...Array.map(openDelegations, (delegation) =>
      releaseForDeletedAccount(delegation, now)
    ),
    ...Option.toArray(
      Option.map(vacation, (held) => discardForDeletedAccount(held, now))
    ),
  ]
  return decision(
    undefined,
    Array.flatMap(decided, (each) => each.writes),
    Array.flatMap(decided, (each) => each.events)
  )
}

const sum = (first: Tally, second: Tally): Tally => ({
  due: first.due + second.due,
  advanced: first.advanced + second.advanced,
  failed: first.failed + second.failed,
})

export const AbsenceLive = Layer.effect(
  Absence,
  Effect.gen(function* () {
    const store = yield* AbsenceStore
    const context = yield* Effect.context<
      Outbox | SqlClient.SqlClient | NotificationRepository | MessageQueue
    >()

    const runNoticed = <Loaded, A, R extends { readonly _tag: string }>(
      name: string,
      load: Effect.Effect<Loaded, SqlError, Transaction>,
      decide: (loaded: Loaded) => Result.Result<Decision<Noticed<A>>, R>
    ) =>
      transact(
        Effect.gen(function* () {
          const transaction = yield* Transaction
          const { value, notices } = yield* commandBody({
            name,
            topic: AbsenceTopic,
            load,
            decide,
            apply: store.apply,
          })
          const recorded = yield* Effect.forEach(notices, (notice) =>
            record[notice.kind](notice)
          )
          yield* transaction.afterCommit(
            Effect.provide(dispatchAll(recorded), context)
          )
          return value
        })
      ).pipe(
        Effect.catchTag('SqlError', Effect.die),
        Effect.catchTag('SchemaError', Effect.die),
        Effect.withSpan(name),
        Effect.provide(context)
      )

    const run = <Loaded, A, R extends { readonly _tag: string }>(
      name: string,
      load: Effect.Effect<Loaded, SqlError, Transaction>,
      decide: (
        loaded: Loaded
      ) => Result.Result<KernelDecision<AbsenceWrite, AbsenceEvent, A>, R>
    ) =>
      transact(
        commandBody({
          name,
          topic: AbsenceTopic,
          load,
          decide,
          apply: store.apply,
        })
      ).pipe(
        Effect.catchTag('SqlError', Effect.die),
        Effect.catchTag('SchemaError', Effect.die),
        Effect.withSpan(name),
        Effect.provide(context)
      )

    const onVacation = <R extends { readonly _tag: string }>(
      name: string,
      userId: string,
      now: DateTime.Utc,
      decide: (held: Held) => Result.Result<VacationDecision<After>, R>
    ) =>
      run(name, store.lockVacation(userId, now), (held) =>
        pipe(
          held,
          Result.fromOption(() => VacationRefusal.NoAccount()),
          Result.flatMap(decide)
        )
      )

    const advanceDueVacations = (edge: Edge, now: DateTime.Utc) =>
      Effect.flatMap(store.dueVacations(edge, now), (userIds) =>
        eachIsolated('vacation-scheduler', userIds, identity, (userId) =>
          onVacation('absence.advanceVacation', userId, now, (held) =>
            Result.succeed(advance(held, now))
          ).pipe(
            Effect.map((after) => after.changed),
            Effect.catchTag('NoAccount', () => Effect.succeed(false))
          )
        )
      )

    const onDelegation = (
      name: string,
      delegationId: string,
      command: DelegationCommand,
      now: DateTime.Utc
    ) =>
      runNoticed(name, store.lockDelegation(delegationId), (held) =>
        pipe(
          held,
          Result.fromOption(() => DelegationRefusal.Gone({ delegationId })),
          Result.flatMap((delegation) => transition(delegation, command, now))
        )
      )

    const asked = (name: string, delegationId: string, command: UserCommand) =>
      Effect.flatMap(DateTime.now, (now) =>
        onDelegation(name, delegationId, command, now)
      ).pipe(Effect.mapError(asDelegationError), Effect.asVoid)

    const advanceDue = (edge: Edge, now: DateTime.Utc) =>
      Effect.flatMap(store.dueDelegations(edge, now), (delegationIds) =>
        eachIsolated('delegation-scheduler', delegationIds, identity, (id) =>
          onDelegation(
            'absence.advanceDelegation',
            id,
            DelegationCommand.Advance(),
            now
          ).pipe(
            Effect.map(Option.isSome),
            Effect.catchTag('Gone', () => Effect.succeed(false))
          )
        )
      )

    return Absence.of({
      openDelegation: (request) =>
        Effect.flatMap(DateTime.now, (now) =>
          runNoticed(
            'absence.openDelegation',
            store.lockForOpening(request),
            (facts) =>
              pipe(
                facts,
                Result.fromOption(() => OpenRefusal.NotOwner()),
                Result.flatMap((held) =>
                  open(held, request, {
                    now,
                    newDelegationId: crypto.randomUUID(),
                  })
                )
              )
          )
        ).pipe(Effect.mapError(asOpenError)),
      respondToDelegation: ({ by, delegationId, accept }) =>
        asked(
          'absence.respondToDelegation',
          delegationId,
          accept
            ? DelegationCommand.Accept({ by })
            : DelegationCommand.Decline({ by })
        ),
      cancelDelegation: ({ by, delegationId }) =>
        asked(
          'absence.cancelDelegation',
          delegationId,
          DelegationCommand.Cancel({ by })
        ),
      completeDelegation: ({ by, delegationId }) =>
        asked(
          'absence.completeDelegation',
          delegationId,
          DelegationCommand.CompleteEarly({ by })
        ),
      advanceDelegations: Effect.gen(function* () {
        const now = yield* DateTime.now
        const started = yield* advanceDue('start', now)
        const ended = yield* advanceDue('end', now)
        return sum(started, ended)
      }).pipe(Effect.withSpan('absence.advanceDelegations')),
      setVacation: ({ userId, start, end }) =>
        Effect.flatMap(DateTime.now, (now) =>
          onVacation('absence.setVacation', userId, now, (held) =>
            request(held, { start, end }, now)
          )
        ).pipe(
          Effect.map((after) => after.vacation),
          Effect.mapError(asSetVacationError)
        ),
      cancelVacation: ({ userId }) =>
        Effect.flatMap(DateTime.now, (now) =>
          onVacation('absence.cancelVacation', userId, now, (held) =>
            callOff(held, now)
          )
        ).pipe(Effect.asVoid, Effect.mapError(asCancelVacationError)),
      advanceVacations: Effect.gen(function* () {
        const now = yield* DateTime.now
        const started = yield* advanceDueVacations('start', now)
        const ended = yield* advanceDueVacations('end', now)
        return sum(started, ended)
      }).pipe(Effect.withSpan('absence.advanceVacations')),
      holdForDeletion: (userId) =>
        store
          .holdForDeletion(userId)
          .pipe(Effect.withSpan('absence.holdForDeletion')),
      releaseForDeletion: (userId) =>
        Effect.flatMap(DateTime.now, (now) =>
          commandBody({
            name: 'absence.releaseForDeletion',
            topic: AbsenceTopic,
            load: store.lockForRelease(userId, now),
            decide: (held) => Result.succeed(releasedForDeletion(held, now)),
            apply: store.apply,
          })
        ).pipe(
          Effect.catchTag('SchemaError', Effect.die),
          Effect.withSpan('absence.releaseForDeletion'),
          Effect.provide(context)
        ),
    })
  })
)
