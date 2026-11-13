import { type Held, takesASlot } from '@lily/api/contexts/canopy/domain/canopy'
import {
  type CanopyChanges,
  type CanopyWrite,
  createCanopy,
  createLink,
  type Decision,
  declineInvitation,
  dissolve,
  Entry,
  invite,
  join,
  type LeaveOutcome,
  leave,
  Notice,
  type Noticed,
  type Placement,
  type Refusal,
  type RefusalOf,
  RoomMove,
  removeMember,
  revokeLink,
  setMute,
  sharePlant,
  unsharePlant,
  updateCanopy,
  withdrawInvitation,
} from '@lily/api/contexts/canopy/domain/decide'
import {
  type CanopyEvent,
  CanopyTopic,
} from '@lily/api/contexts/canopy/domain/events'
import {
  hashInviteToken,
  newInviteToken,
} from '@lily/api/contexts/canopy/domain/invitation'
import {
  CanopyStore,
  Find,
  InvitationScope,
  type LockPlan,
  lockPlan,
  PlantScope,
  RoomScope,
} from '@lily/api/contexts/canopy/store'
import { Outbox } from '@lily/api/kernel/outbox'
import { Actor, type PlantPermit } from '@lily/api/kernel/permit'
import {
  type CommandSpec,
  commandBody,
  runCommand,
  transact,
} from '@lily/api/kernel/transact'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  dispatchAll,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import {
  AlreadyInCanopyError,
  CANOPY_INVITE_TTL_DAYS,
  CanopyFullError,
  CanopyId,
  CanopyInviteExpiredError,
  CanopyInviteeAlreadyMemberError,
  CanopyInviteNotFoundError,
  CanopyMemberNotFoundError,
  CanopyNotFoundError,
  type LimitExceededError,
  NotCanopyOwnerError,
  PlantInDelegationError,
  type PlantOwner,
  RoomNotFoundError,
  UserNotFoundError,
} from '@lily/shared'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { MessageQueue } from '@lily/shared/server'
import {
  Array,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  type Result,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

interface InCanopy {
  readonly canopyId: CanopyId
}

export type JoinVia = Data.TaggedEnum<{
  /** The token from the join URL, as the joiner sent it. */
  Link: { readonly token: string }
  Invitation: { readonly invitationId: string }
}>
export const JoinVia = Data.taggedEnum<JoinVia>()

export type JoinError =
  | CanopyInviteNotFoundError
  | CanopyInviteExpiredError
  | AlreadyInCanopyError
  | CanopyFullError

/**
 * The one way to change a canopy, its members, links, invitations and mutes,
 * and the one way to change who owns a plant or a room once it exists. Each
 * command takes its locks, applies the rules, writes, records the
 * notifications it owes and publishes what happened, in one transaction.
 */
export class Canopy extends Context.Service<
  Canopy,
  {
    readonly create: (command: {
      readonly by: string
      readonly name: string
    }) => Effect.Effect<InCanopy, AlreadyInCanopyError>
    /** Any member renames. Timezone and location need the owner. */
    readonly update: (command: {
      readonly by: string
      readonly changes: CanopyChanges
    }) => Effect.Effect<InCanopy, CanopyNotFoundError | NotCanopyOwnerError>
    /**
     * The plants the leaver shared go back to them. The earliest joiner
     * succeeds a leaving owner, and the last member dissolves the canopy.
     */
    readonly leave: (command: {
      readonly by: string
    }) => Effect.Effect<LeaveOutcome, CanopyNotFoundError>
    /** The owner only. The plants the member shared go back to them. */
    readonly removeMember: (command: {
      readonly by: string
      readonly target: string
    }) => Effect.Effect<
      InCanopy,
      CanopyNotFoundError | NotCanopyOwnerError | CanopyMemberNotFoundError
    >
    /**
     * The owner only. Each member takes back the plants they shared, the
     * owner takes the rooms and every other plant, and nobody is told.
     */
    readonly dissolve: (command: {
      readonly by: string
    }) => Effect.Effect<void, CanopyNotFoundError | NotCanopyOwnerError>
    /**
     * Account deletion, soft and hard. Takes the user out of their canopy,
     * where the plants they shared stay, and runs `deletion` in the same
     * transaction, once the canopy row and every delegation of the user are
     * locked. A user with no canopy still gets the delegation locks and the
     * deletion.
     *
     * The one command that keeps `SqlError` typed: the account cleanup
     * isolates a failing account by catching it.
     */
    readonly leaveForDeletion: (
      userId: string
    ) => <A, E, R>(
      deletion: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E | SqlError, R>
    /** Any member. Replaces the live link. */
    readonly createLink: (command: {
      readonly by: string
    }) => Effect.Effect<
      { readonly token: string; readonly expiresAt: DateTime.Utc },
      CanopyNotFoundError
    >
    readonly revokeLink: (command: {
      readonly by: string
    }) => Effect.Effect<void, CanopyNotFoundError>
    /**
     * Joining the canopy the joiner is already in succeeds and tells nobody.
     * A direct invitation is spent by the join it admits.
     */
    readonly join: (command: {
      readonly joiner: string
      readonly via: JoinVia
    }) => Effect.Effect<InCanopy, JoinError>
    /**
     * Any member invites an account that can be reached. Sending again while
     * the invitation is open, or within a week of the invitee declining,
     * succeeds and tells nobody.
     */
    readonly invite: (command: {
      readonly by: string
      readonly invitee: string
    }) => Effect.Effect<
      InCanopy,
      | CanopyNotFoundError
      | UserNotFoundError
      | CanopyInviteeAlreadyMemberError
      | CanopyFullError
    >
    /** The sender or the owner. Withdrawing twice succeeds. */
    readonly withdrawInvitation: (command: {
      readonly by: string
      readonly invitationId: string
    }) => Effect.Effect<
      InCanopy,
      CanopyNotFoundError | CanopyInviteNotFoundError
    >
    /** The invitee only, and nobody is told. Declining twice succeeds. */
    readonly declineInvitation: (command: {
      readonly by: string
      readonly invitationId: string
    }) => Effect.Effect<void, CanopyInviteNotFoundError>
    /**
     * The actor's own plant into their canopy. `roomId` is one of the
     * canopy's rooms, and none leaves the plant in no room. No job moves a
     * plant: a permit a job holds answers `PlantNotFoundError`, here and in
     * `unsharePlant`.
     */
    readonly sharePlant: (command: {
      readonly permit: PlantPermit<'share'>
      readonly roomId: Option.Option<string>
    }) => Effect.Effect<
      void,
      | CanopyNotFoundError
      | PlantInDelegationError
      | PlantNotFoundError
      | RoomNotFoundError
      | LimitExceededError
    >
    /**
     * A canopy plant to the actor, as their own. Its sharer may, and the
     * canopy owner may once the sharer is no longer a member.
     */
    readonly unsharePlant: (command: {
      readonly permit: PlantPermit<'unshare'>
      readonly roomId: Option.Option<string>
    }) => Effect.Effect<
      void,
      | CanopyNotFoundError
      | PlantNotFoundError
      | PlantNotAuthorizedError
      | RoomNotFoundError
      | LimitExceededError
    >
    /**
     * The actor stops, or starts again, being reminded of a plant of their
     * canopy. Answers `PlantNotFoundError` once the plant or the actor has
     * left the canopy, and to a job.
     */
    readonly setMute: (command: {
      readonly permit: PlantPermit<'mute'>
      readonly muted: boolean
    }) => Effect.Effect<void, PlantNotFoundError>
    /**
     * Locks `canopyId` for the rest of the caller's transaction and checks
     * that `by` is a member. For the callers that add a plant or a room to a
     * canopy, so the count they read cannot move. Opens no transaction.
     */
    readonly holdAsMember: (command: {
      readonly by: string
      readonly canopyId: string
    }) => Effect.Effect<void, CanopyNotFoundError | SqlError>
  }
>()('canopy/Canopy') {}

const errorOf = {
  NotMember: () => new CanopyNotFoundError(),
  NotOwner: () => new NotCanopyOwnerError(),
  AlreadyInCanopy: ({ canopyName }) => new AlreadyInCanopyError({ canopyName }),
  CanopyFull: ({ limit }) => new CanopyFullError({ limit }),
  MemberNotFound: () => new CanopyMemberNotFoundError(),
  InviteNotFound: () => new CanopyInviteNotFoundError(),
  InviteExpired: () => new CanopyInviteExpiredError(),
  InviteeNotFound: ({ userId }) => new UserNotFoundError({ userId }),
  InviteeAlreadyMember: () => new CanopyInviteeAlreadyMemberError(),
  PlantInDelegation: ({ plantId }) => new PlantInDelegationError({ plantId }),
  PlantGone: ({ plantId }) => new PlantNotFoundError({ plantId }),
  PlantNotYours: () => new PlantNotAuthorizedError(),
  RoomNotFound: ({ roomId }) => new RoomNotFoundError({ roomId }),
  OverLimit: ({ error }) => error,
} satisfies {
  readonly [T in Refusal['_tag']]: (refusal: RefusalOf<T>) => unknown
}

type ErrorOf<T extends Refusal['_tag']> = ReturnType<(typeof errorOf)[T]>

const refusalAsError = Match.type<Refusal>().pipe(Match.tagsExhaustive(errorOf))

const asError = <R extends Refusal>(refusal: R) =>
  refusalAsError(refusal) as ErrorOf<R['_tag']>

const senderNameOf = (name: string | null): { readonly senderName?: string } =>
  Option.match(Option.fromNullishOr(name), {
    onNone: () => ({}),
    onSome: (senderName) => ({ senderName }),
  })

const record = Notice.$match({
  MemberJoined: ({ to, joinerName, canopyName }) =>
    recordNotification(
      'canopy_member_joined',
      to.userId,
      { ...senderNameOf(joinerName), canopyName },
      to.language,
      {}
    ),
  MemberLeft: ({ to, leaverName, canopyName }) =>
    recordNotification(
      'canopy_member_left',
      to.userId,
      { ...senderNameOf(leaverName), canopyName },
      to.language,
      {}
    ),
  MemberRemoved: ({ to, canopyName }) =>
    recordNotification(
      'canopy_member_removed',
      to.userId,
      { canopyName },
      to.language,
      {}
    ),
  Invited: ({ to, inviterName, canopyName, invitationId }) =>
    recordNotification(
      'canopy_invitation',
      to.userId,
      { ...senderNameOf(inviterName), canopyName },
      to.language,
      { invitationId }
    ),
})

const viaAsEntry = JoinVia.$match({
  Link: ({ token }) => ({
    entry: Entry.Link({ tokenHash: hashInviteToken(token) }),
    canopy: Find.ByLink({ tokenHash: hashInviteToken(token) }),
    invitations: InvitationScope.None(),
  }),
  Invitation: ({ invitationId }) => ({
    entry: Entry.Invitation({ invitationId }),
    canopy: Find.ByInvitation({ invitationId }),
    invitations: InvitationScope.One({ invitationId }),
  }),
})

const userOf = (
  permit: PlantPermit<'share' | 'unshare' | 'mute'>
): Effect.Effect<string, PlantNotFoundError> =>
  Actor.$match(permit.actor, {
    User: ({ userId }) => Effect.succeed(userId),
    System: () =>
      Effect.fail(new PlantNotFoundError({ plantId: permit.plantId })),
  })

const movePlan = (by: string, plantId: string, roomId: Option.Option<string>) =>
  lockPlan({
    actor: Option.some(by),
    canopy: Find.OfMember({ userId: by }),
    rooms: Option.match(roomId, {
      onNone: () => RoomScope.None(),
      onSome: (id) => RoomScope.Pin({ roomId: id }),
    }),
    plants: PlantScope.Move({ plantId }),
  })

const ending = (userId: string) =>
  lockPlan({
    canopy: Find.OfMember({ userId }),
    invitations: InvitationScope.All(),
    rooms: RoomScope.OfCanopy(),
    plants: PlantScope.OfCanopy(),
  })

const roomMove = (roomId: Option.Option<string>): Placement =>
  Option.match(roomId, {
    onNone: () => RoomMove.Clear(),
    onSome: (id) => RoomMove.Put({ roomId: id }),
  })

export const CanopyLive = Layer.effect(
  Canopy,
  Effect.gen(function* () {
    const store = yield* CanopyStore
    const delegations = yield* DelegationRepository
    const limits = yield* LimitChecker
    const context = yield* Effect.context<
      Outbox | SqlClient.SqlClient | NotificationRepository | MessageQueue
    >()
    const sql = yield* SqlClient.SqlClient
    const outbox = yield* Outbox

    const spec = <Loaded, A, R extends Refusal>(
      name: string,
      load: Effect.Effect<Loaded, SqlError>,
      decide: (loaded: Loaded) => Result.Result<Decision<A>, R>
    ): CommandSpec<Loaded, CanopyWrite, CanopyEvent, A, R, never> => ({
      name,
      topic: CanopyTopic,
      load,
      decide,
      apply: store.apply,
    })

    const run = <A, R extends Refusal>(
      name: string,
      plan: LockPlan,
      decide: (held: Held) => Result.Result<Decision<A>, R>
    ) =>
      runCommand(spec(name, store.lockAndLoad(plan), decide)).pipe(
        Effect.mapError(asError),
        Effect.provide(context)
      )

    const runInformed = <Facts, A, R extends Refusal>(
      name: string,
      plan: LockPlan,
      factsUnder: (held: Held) => Effect.Effect<Facts, SqlError>,
      decide: (held: Held, facts: Facts) => Result.Result<Decision<A>, R>
    ) =>
      runCommand(
        spec(
          name,
          Effect.flatMap(store.lockAndLoad(plan), (held) =>
            Effect.map(factsUnder(held), (facts) => ({ held, facts }))
          ),
          ({ held, facts }) => decide(held, facts)
        )
      ).pipe(Effect.mapError(asError), Effect.provide(context))

    const overLimit = (held: Held, plantId: string, receiver: PlantOwner) =>
      Array.some(
        held.plants,
        (plant) => plant.id === plantId && takesASlot(plant)
      )
        ? limits.checkPlantLimit(receiver).pipe(
            Effect.as(Option.none<LimitExceededError>()),
            Effect.catchTag('LimitExceededError', (error) =>
              Effect.succeed(Option.some(error))
            )
          )
        : Effect.succeed(Option.none<LimitExceededError>())

    const noticed = <A, R extends Refusal>(
      name: string,
      plan: LockPlan,
      decide: (held: Held) => Result.Result<Decision<Noticed<A>>, R>
    ) =>
      Effect.flatMap(
        commandBody(spec(name, store.lockAndLoad(plan), decide)),
        ({ value, notices }) =>
          Effect.map(Effect.forEach(notices, record), (recorded) => ({
            value,
            recorded,
          }))
      ).pipe(Effect.provide(context))

    const runNoticed = <A, R extends Refusal>(
      name: string,
      plan: LockPlan,
      decide: (held: Held) => Result.Result<Decision<Noticed<A>>, R>
    ) =>
      transact(noticed(name, plan, decide)).pipe(
        Effect.tap(({ recorded }) => dispatchAll(recorded)),
        Effect.map(({ value }) => value),
        Effect.catchTag('SqlError', Effect.die),
        Effect.catchTag('SchemaError', Effect.die),
        Effect.mapError(asError),
        Effect.withSpan(name),
        Effect.provide(context)
      )

    const ofMember = (userId: string) =>
      lockPlan({ canopy: Find.OfMember({ userId }) })

    return Canopy.of({
      create: ({ by, name }) =>
        Effect.flatMap(DateTime.now, (now) =>
          run('canopy.create', lockPlan({ actor: Option.some(by) }), (held) =>
            createCanopy(held, {
              by,
              canopyId: CanopyId.make(crypto.randomUUID()),
              name,
              now,
            })
          )
        ),
      update: ({ by, changes }) =>
        run('canopy.update', ofMember(by), (held) =>
          updateCanopy(held, { by, changes })
        ),
      leave: ({ by }) =>
        Effect.flatMap(DateTime.now, (now) =>
          runNoticed('canopy.leave', ending(by), (held) =>
            leave(held, { by, plants: 'return', reason: 'left', now })
          )
        ),
      removeMember: ({ by, target }) =>
        Effect.flatMap(DateTime.now, (now) =>
          runNoticed('canopy.removeMember', ending(by), (held) =>
            removeMember(held, { by, target, now })
          )
        ),
      dissolve: ({ by }) =>
        run('canopy.dissolve', ending(by), (held) => dissolve(held, { by })),
      leaveForDeletion: (userId) => (deletion) =>
        Effect.flatMap(DateTime.now, (now) =>
          transact(
            Effect.all([
              noticed(
                'canopy.leaveForDeletion',
                { ...ending(userId), absenceOf: Option.some(userId) },
                (held) =>
                  leave(held, {
                    by: userId,
                    plants: 'stay',
                    reason: 'accountDeleted',
                    now,
                  })
              ).pipe(
                Effect.map(({ recorded }) => recorded),
                Effect.catchTag('NotMember', () => Effect.succeed([]))
              ),
              deletion,
            ])
          )
        ).pipe(
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.provideService(Outbox, outbox),
          Effect.tap(([recorded]) =>
            Effect.provide(dispatchAll(recorded), context)
          ),
          Effect.map(([, deleted]) => deleted),
          Effect.catchTag('SchemaError', Effect.die),
          Effect.withSpan('canopy.leaveForDeletion', {
            attributes: { 'user.id': userId },
          })
        ),
      createLink: ({ by }) =>
        Effect.gen(function* () {
          const { token, tokenHash } = yield* newInviteToken
          const now = yield* DateTime.now
          const expiresAt = DateTime.add(now, { days: CANOPY_INVITE_TTL_DAYS })
          yield* run('canopy.createLink', ofMember(by), (held) =>
            createLink(held, { by, tokenHash, expiresAt, now })
          )
          return { token, expiresAt }
        }),
      revokeLink: ({ by }) =>
        Effect.flatMap(DateTime.now, (now) =>
          run('canopy.revokeLink', ofMember(by), (held) =>
            revokeLink(held, { by, now })
          )
        ),
      join: ({ joiner, via }) => {
        const { entry, canopy, invitations } = viaAsEntry(via)
        return Effect.flatMap(DateTime.now, (now) =>
          runNoticed(
            'canopy.join',
            lockPlan({
              actor: Option.some(joiner),
              canopy,
              accounts: [joiner],
              invitations,
            }),
            (held) => join(held, { joiner, via: entry, now })
          )
        )
      },
      invite: ({ by, invitee }) =>
        Effect.flatMap(DateTime.now, (now) =>
          runNoticed(
            'canopy.invite',
            lockPlan({
              canopy: Find.OfMember({ userId: by }),
              accounts: [invitee],
              invitations: InvitationScope.OfInvitee({ invitee }),
            }),
            (held) =>
              invite(held, {
                by,
                invitee,
                newInvitationId: crypto.randomUUID(),
                expiresAt: DateTime.add(now, { days: CANOPY_INVITE_TTL_DAYS }),
                now,
              })
          )
        ),
      withdrawInvitation: ({ by, invitationId }) =>
        Effect.flatMap(DateTime.now, (now) =>
          run(
            'canopy.withdrawInvitation',
            lockPlan({
              canopy: Find.OfMember({ userId: by }),
              invitations: InvitationScope.One({ invitationId }),
            }),
            (held) => withdrawInvitation(held, { by, invitationId, now })
          )
        ),
      declineInvitation: ({ by, invitationId }) =>
        Effect.flatMap(DateTime.now, (now) =>
          run(
            'canopy.declineInvitation',
            lockPlan({ invitations: InvitationScope.One({ invitationId }) }),
            (held) => declineInvitation(held, { by, invitationId, now })
          )
        ),
      sharePlant: ({ permit, roomId }) =>
        Effect.flatMap(userOf(permit), (by) =>
          runInformed(
            'canopy.sharePlant',
            movePlan(by, permit.plantId, roomId),
            (held) =>
              Effect.all({
                inOpenDelegation: delegations.hasOpenDelegationForPlant(
                  permit.plantId
                ),
                overLimit: Option.match(held.canopy, {
                  onNone: () =>
                    Effect.succeed(Option.none<LimitExceededError>()),
                  onSome: (canopy) =>
                    overLimit(held, permit.plantId, {
                      _tag: 'Canopy',
                      canopyId: canopy.id,
                    }),
                }),
              }),
            (held, facts) =>
              sharePlant(held, {
                by,
                plantId: permit.plantId,
                room: roomMove(roomId),
                facts,
              })
          )
        ),
      unsharePlant: ({ permit, roomId }) =>
        Effect.flatMap(userOf(permit), (by) =>
          runInformed(
            'canopy.unsharePlant',
            movePlan(by, permit.plantId, roomId),
            (held) =>
              Effect.map(
                overLimit(held, permit.plantId, { _tag: 'User', userId: by }),
                (limit) => ({ overLimit: limit })
              ),
            (held, facts) =>
              unsharePlant(held, {
                by,
                plantId: permit.plantId,
                room: roomMove(roomId),
                facts,
              })
          )
        ),
      setMute: ({ permit, muted }) =>
        Effect.flatMap(userOf(permit), (by) =>
          run(
            'canopy.setMute',
            lockPlan({
              canopy: Find.OfMember({ userId: by }),
              plants: PlantScope.Pin({ plantId: permit.plantId }),
            }),
            (held) => setMute(held, { by, plantId: permit.plantId, muted })
          )
        ),
      holdAsMember: ({ by, canopyId }) =>
        Effect.flatMap(store.lockAndLoad(ofMember(by)), (held) =>
          Option.exists(held.canopy, (canopy) => canopy.id === canopyId)
            ? Effect.void
            : Effect.fail(new CanopyNotFoundError())
        ),
    })
  })
)
