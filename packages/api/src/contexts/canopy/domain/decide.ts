import {
  type Account,
  type CanopyState,
  type Held,
  type HeldPlant,
  type Invitation,
  type Location,
  type Member,
  memberOf,
  successorOf,
  takesASlot,
} from '@lily/api/contexts/canopy/domain/canopy'
import type {
  CanopyEvent,
  MemberLeftReason,
} from '@lily/api/contexts/canopy/domain/events'
import {
  type Admission,
  admissionOf,
  planInvitation,
} from '@lily/api/contexts/canopy/domain/invitation'
import {
  decision,
  type Decision as KernelDecision,
} from '@lily/api/kernel/transact'
import {
  CANOPY_MAX_MEMBERS,
  type CanopyId,
  type CanopyInvitationStatus,
  type CanopyMemberRole,
  type LimitExceededError,
  type PlantOwner,
} from '@lily/shared'
import {
  Array,
  Data,
  DateTime,
  Equal,
  Match,
  Option,
  pipe,
  Result,
} from 'effect'

export interface CanopyChanges {
  readonly name: Option.Option<string>
  readonly timezone: Option.Option<string>
  readonly latitude: Option.Option<number | null>
  readonly longitude: Option.Option<number | null>
}

export type RoomMove = Data.TaggedEnum<{
  Keep: Record<never, never>
  Clear: Record<never, never>
  Put: { readonly roomId: string }
}>
export const RoomMove = Data.taggedEnum<RoomMove>()

export type Placement = Exclude<RoomMove, { readonly _tag: 'Keep' }>

export type CanopyWrite = Data.TaggedEnum<{
  CreateCanopy: {
    readonly id: CanopyId
    readonly name: string
    readonly timezone: string
    readonly location: Option.Option<Location>
  }
  UpdateCanopy: {
    readonly canopyId: CanopyId
    readonly changes: CanopyChanges
  }
  DeleteCanopy: { readonly canopyId: CanopyId }
  AddMember: {
    readonly canopyId: CanopyId
    readonly userId: string
    readonly role: CanopyMemberRole
    readonly at: DateTime.Utc
  }
  RemoveMember: { readonly canopyId: CanopyId; readonly userId: string }
  SetOwner: { readonly canopyId: CanopyId; readonly userId: string }
  ReplaceLink: {
    readonly canopyId: CanopyId
    readonly tokenHash: string
    readonly createdBy: string
    readonly expiresAt: DateTime.Utc
    readonly at: DateTime.Utc
  }
  RevokeLinks: {
    readonly canopyId: CanopyId
    readonly onlyCreatedBy: Option.Option<string>
    readonly at: DateTime.Utc
  }
  OpenInvitation: {
    readonly id: string
    readonly canopyId: CanopyId
    readonly invitee: string
    readonly invitedBy: string
    readonly expiresAt: DateTime.Utc
    readonly at: DateTime.Utc
  }
  ResolveInvitation: {
    readonly id: string
    readonly to: Exclude<CanopyInvitationStatus, 'pending'>
    readonly at: DateTime.Utc
  }
  WithdrawInvitationsSentBy: {
    readonly canopyId: CanopyId
    readonly userId: string
    readonly at: DateTime.Utc
  }
  Mute: { readonly userId: string; readonly plantId: string }
  Unmute: { readonly userId: string; readonly plantId: string }
  MovePlants: {
    readonly plantIds: Array.NonEmptyReadonlyArray<string>
    readonly from: PlantOwner
    readonly to: PlantOwner
    readonly room: RoomMove
  }
  MoveRooms: {
    readonly roomIds: Array.NonEmptyReadonlyArray<string>
    readonly canopyId: CanopyId
    readonly toUserId: string
  }
}>
export const CanopyWrite = Data.taggedEnum<CanopyWrite>()

export type Notice = Data.TaggedEnum<{
  MemberJoined: {
    readonly to: Account
    readonly joinerName: string | null
    readonly canopyName: string
  }
  MemberLeft: {
    readonly to: Account
    readonly leaverName: string | null
    readonly canopyName: string
  }
  MemberRemoved: { readonly to: Account; readonly canopyName: string }
  Invited: {
    readonly to: Account
    readonly inviterName: string | null
    readonly canopyName: string
    readonly invitationId: string
  }
}>
export const Notice = Data.taggedEnum<Notice>()

export interface Noticed<A> {
  readonly value: A
  readonly notices: ReadonlyArray<Notice>
}

export type Refusal = Data.TaggedEnum<{
  NotMember: Record<never, never>
  NotOwner: Record<never, never>
  AlreadyInCanopy: { readonly canopyName: string }
  CreatorGone: Record<never, never>
  CanopyFull: { readonly limit: number }
  MemberNotFound: Record<never, never>
  InviteNotFound: Record<never, never>
  InviteExpired: Record<never, never>
  InviteeNotFound: { readonly userId: string }
  InviteeAlreadyMember: Record<never, never>
  PlantInDelegation: { readonly plantId: string }
  PlantGone: { readonly plantId: string }
  PlantNotYours: Record<never, never>
  RoomNotFound: { readonly roomId: string }
  OverLimit: { readonly error: LimitExceededError }
}>
export const Refusal = Data.taggedEnum<Refusal>()

export type RefusalOf<T extends Refusal['_tag']> = Extract<
  Refusal,
  { readonly _tag: T }
>

export type Decision<A> = KernelDecision<CanopyWrite, CanopyEvent, A>
type Decided<A, R extends Refusal['_tag']> = Result.Result<
  Decision<A>,
  RefusalOf<R>
>

const MAY = {
  rename: ['owner', 'member'],
  relocate: ['owner'],
  createLink: ['owner', 'member'],
  revokeLink: ['owner', 'member'],
  invite: ['owner', 'member'],
  withdrawOwnInvitation: ['owner', 'member'],
  withdrawInvitationOfMember: ['owner'],
  share: ['owner', 'member'],
  unshareOwn: ['owner', 'member'],
  unshareOfMember: [],
  unshareOfDeparted: ['owner'],
  mute: ['owner', 'member'],
  removeMember: ['owner'],
  dissolve: ['owner'],
} as const satisfies Record<string, ReadonlyArray<CanopyMemberRole>>

type CanopyAction = keyof typeof MAY

type RoleRefusal<A extends CanopyAction> = A extends CanopyAction
  ? CanopyMemberRole extends (typeof MAY)[A][number]
    ? never
    : 'NotOwner'
  : never

interface Seat {
  readonly canopy: CanopyState
  readonly member: Member
}

const seatOf = (
  held: Held,
  userId: string
): Result.Result<Seat, RefusalOf<'NotMember'>> =>
  pipe(
    held.canopy,
    Option.flatMap((canopy) =>
      Option.map(memberOf(canopy, userId), (member) => ({ canopy, member }))
    ),
    Result.fromOption(() => Refusal.NotMember())
  )

const may = (member: Member, action: CanopyAction): boolean =>
  Array.contains<CanopyMemberRole>(MAY[action], member.role)

const acting = <A extends CanopyAction>(
  held: Held,
  by: string,
  actions: ReadonlyArray<A>
): Result.Result<Seat, RefusalOf<'NotMember'> | RefusalOf<RoleRefusal<A>>> =>
  Result.flatMap(seatOf(held, by), (seat) =>
    Array.every(actions, (action) => may(seat.member, action))
      ? Result.succeed(seat)
      : Result.fail(Refusal.NotOwner() as RefusalOf<RoleRefusal<A>>)
  )

export const createCanopy = (
  held: Held,
  command: {
    readonly by: string
    readonly canopyId: CanopyId
    readonly name: string
    readonly now: DateTime.Utc
  }
): Decided<
  { readonly canopyId: CanopyId },
  'AlreadyInCanopy' | 'CreatorGone'
> =>
  Result.gen(function* () {
    if (Option.isSome(held.actorCanopy)) {
      return yield* Result.fail(
        Refusal.AlreadyInCanopy({ canopyName: held.actorCanopy.value.name })
      )
    }
    const creator = yield* Result.fromNullishOr(
      held.accounts.get(command.by),
      () => Refusal.CreatorGone()
    )
    return decision({ canopyId: command.canopyId }, [
      CanopyWrite.CreateCanopy({
        id: command.canopyId,
        name: command.name,
        timezone: Option.getOrElse(
          Option.fromNullishOr(creator.timezone),
          () => 'UTC'
        ),
        location: creator.location,
      }),
      CanopyWrite.AddMember({
        canopyId: command.canopyId,
        userId: command.by,
        role: 'owner',
        at: command.now,
      }),
    ])
  })

const actionsOf = (
  changes: CanopyChanges
): ReadonlyArray<'rename' | 'relocate'> => [
  ...(Option.isSome(changes.name) ? (['rename'] as const) : []),
  ...(Option.isSome(changes.timezone) ||
  Option.isSome(changes.latitude) ||
  Option.isSome(changes.longitude)
    ? (['relocate'] as const)
    : []),
]

export const updateCanopy = (
  held: Held,
  command: { readonly by: string; readonly changes: CanopyChanges }
): Decided<{ readonly canopyId: CanopyId }, 'NotMember' | 'NotOwner'> =>
  Result.map(
    acting(held, command.by, actionsOf(command.changes)),
    ({ canopy }) =>
      decision(
        { canopyId: canopy.id },
        Array.isReadonlyArrayNonEmpty(actionsOf(command.changes))
          ? [
              CanopyWrite.UpdateCanopy({
                canopyId: canopy.id,
                changes: command.changes,
              }),
            ]
          : [],
        Option.exists(
          command.changes.timezone,
          (timezone) => timezone !== canopy.timezone
        )
          ? [{ _tag: 'CanopyTimezoneChanged', canopyId: canopy.id }]
          : []
      )
  )

export const createLink = (
  held: Held,
  command: {
    readonly by: string
    readonly tokenHash: string
    readonly expiresAt: DateTime.Utc
    readonly now: DateTime.Utc
  }
): Decided<void, 'NotMember'> =>
  Result.map(acting(held, command.by, ['createLink']), ({ canopy }) =>
    decision(undefined, [
      CanopyWrite.ReplaceLink({
        canopyId: canopy.id,
        tokenHash: command.tokenHash,
        createdBy: command.by,
        expiresAt: command.expiresAt,
        at: command.now,
      }),
    ])
  )

export const revokeLink = (
  held: Held,
  command: { readonly by: string; readonly now: DateTime.Utc }
): Decided<void, 'NotMember'> =>
  Result.map(acting(held, command.by, ['revokeLink']), ({ canopy }) =>
    decision(undefined, [
      CanopyWrite.RevokeLinks({
        canopyId: canopy.id,
        onlyCreatedBy: Option.none(),
        at: command.now,
      }),
    ])
  )

export type Entry = Data.TaggedEnum<{
  Link: { readonly tokenHash: string }
  Invitation: { readonly invitationId: string }
}>
export const Entry = Data.taggedEnum<Entry>()

type EntryRefusal = RefusalOf<'InviteNotFound' | 'InviteExpired'>

interface Pass {
  readonly spendsInvitation: Option.Option<string>
  readonly readmitsOnly: boolean
}

interface Door extends Pass {
  readonly canopy: CanopyState
}

const passOf = (pass: Pass): Result.Result<Pass, EntryRefusal> =>
  Result.succeed(pass)

const noEntry = (refusal: EntryRefusal): Result.Result<Pass, EntryRefusal> =>
  Result.fail(refusal)

const PASS_OF_INVITATION: Record<
  Admission,
  (invitationId: string) => Result.Result<Pass, EntryRefusal>
> = {
  open: (invitationId) =>
    passOf({
      spendsInvitation: Option.some(invitationId),
      readmitsOnly: false,
    }),
  spent: () => passOf({ spendsInvitation: Option.none(), readmitsOnly: true }),
  expired: () => noEntry(Refusal.InviteExpired()),
  gone: () => noEntry(Refusal.InviteNotFound()),
}

const passOfLink = (
  canopy: CanopyState,
  tokenHash: string,
  now: DateTime.Utc
): Result.Result<Pass, EntryRefusal> =>
  Option.match(
    Option.filter(canopy.link, (link) => link.tokenHash === tokenHash),
    {
      onNone: () => noEntry(Refusal.InviteNotFound()),
      onSome: (link) =>
        DateTime.isGreaterThan(link.expiresAt, now)
          ? passOf({ spendsInvitation: Option.none(), readmitsOnly: false })
          : noEntry(Refusal.InviteExpired()),
    }
  )

const passOfInvitation = (
  held: Held,
  joiner: string,
  invitationId: string,
  now: DateTime.Utc
): Result.Result<Pass, EntryRefusal> =>
  Option.match(
    Array.findFirst(
      held.invitations,
      (invitation) =>
        invitation.id === invitationId && invitation.invitee === joiner
    ),
    {
      onNone: () => noEntry(Refusal.InviteNotFound()),
      onSome: (invitation) =>
        PASS_OF_INVITATION[admissionOf(invitation, now)](invitation.id),
    }
  )

const doorOf = (
  held: Held,
  joiner: string,
  via: Entry,
  now: DateTime.Utc
): Result.Result<Door, EntryRefusal> =>
  Result.flatMap(
    Result.fromOption(held.canopy, () => Refusal.InviteNotFound()),
    (canopy) =>
      Result.map(
        Entry.$match(via, {
          Link: ({ tokenHash }) => passOfLink(canopy, tokenHash, now),
          Invitation: ({ invitationId }) =>
            passOfInvitation(held, joiner, invitationId, now),
        }),
        (pass) => ({ canopy, ...pass })
      )
  )

export const join = (
  held: Held,
  command: {
    readonly joiner: string
    readonly via: Entry
    readonly now: DateTime.Utc
  }
): Decided<
  Noticed<{ readonly canopyId: CanopyId }>,
  'InviteNotFound' | 'InviteExpired' | 'AlreadyInCanopy' | 'CanopyFull'
> =>
  Result.gen(function* () {
    const { joiner, now } = command
    const { canopy, spendsInvitation, readmitsOnly } = yield* doorOf(
      held,
      joiner,
      command.via,
      now
    )
    const spent = Array.map(Option.toArray(spendsInvitation), (id) =>
      CanopyWrite.ResolveInvitation({ id, to: 'accepted', at: now })
    )
    if (Option.isSome(memberOf(canopy, joiner))) {
      return decision({ value: { canopyId: canopy.id }, notices: [] }, spent)
    }
    const elsewhere = Option.filter(
      held.actorCanopy,
      (current) => current.canopyId !== canopy.id
    )
    if (Option.isSome(elsewhere)) {
      return yield* Result.fail(
        Refusal.AlreadyInCanopy({ canopyName: elsewhere.value.name })
      )
    }
    const account = yield* Result.fromNullishOr(held.accounts.get(joiner), () =>
      Refusal.InviteNotFound()
    )
    if (readmitsOnly) return yield* Result.fail(Refusal.InviteNotFound())
    if (canopy.members.length >= CANOPY_MAX_MEMBERS) {
      return yield* Result.fail(
        Refusal.CanopyFull({ limit: CANOPY_MAX_MEMBERS })
      )
    }
    return decision(
      {
        value: { canopyId: canopy.id },
        notices: pipe(
          canopy.members,
          Array.flatMap((member) =>
            Option.toArray(
              Option.fromNullishOr(held.accounts.get(member.userId))
            )
          ),
          Array.map((to) =>
            Notice.MemberJoined({
              to,
              joinerName: account.name,
              canopyName: canopy.name,
            })
          )
        ),
      },
      [
        CanopyWrite.AddMember({
          canopyId: canopy.id,
          userId: joiner,
          role: 'member',
          at: now,
        }),
        ...spent,
      ],
      [{ _tag: 'MemberJoined', canopyId: canopy.id, userId: joiner }]
    )
  })

export const invite = (
  held: Held,
  command: {
    readonly by: string
    readonly invitee: string
    readonly newInvitationId: string
    readonly expiresAt: DateTime.Utc
    readonly now: DateTime.Utc
  }
): Decided<
  Noticed<{ readonly canopyId: CanopyId }>,
  'NotMember' | 'InviteeNotFound' | 'InviteeAlreadyMember' | 'CanopyFull'
> =>
  Result.gen(function* () {
    const { by, now } = command
    const { canopy } = yield* acting(held, by, ['invite'])
    const invitee = yield* Result.fromOption(
      Option.filter(
        Option.fromNullishOr(held.accounts.get(command.invitee)),
        (account) => account.reachable
      ),
      () => Refusal.InviteeNotFound({ userId: command.invitee })
    )
    if (Option.isSome(memberOf(canopy, invitee.userId))) {
      return yield* Result.fail(Refusal.InviteeAlreadyMember())
    }
    if (canopy.members.length >= CANOPY_MAX_MEMBERS) {
      return yield* Result.fail(
        Refusal.CanopyFull({ limit: CANOPY_MAX_MEMBERS })
      )
    }
    const earlier = Array.findFirst(
      held.invitations,
      (invitation) => invitation.invitee === invitee.userId
    )
    const value = { canopyId: canopy.id }
    if (planInvitation(Option.getOrNull(earlier), now) !== 'send') {
      return decision({ value, notices: [] }, [])
    }
    const id = Option.match(earlier, {
      onNone: () => command.newInvitationId,
      onSome: (invitation) => invitation.id,
    })
    return decision(
      {
        value,
        notices: [
          Notice.Invited({
            to: invitee,
            inviterName: pipe(
              Option.fromNullishOr(held.accounts.get(by)),
              Option.flatMapNullishOr((account) => account.name),
              Option.getOrNull
            ),
            canopyName: canopy.name,
            invitationId: id,
          }),
        ],
      },
      [
        CanopyWrite.OpenInvitation({
          id,
          canopyId: canopy.id,
          invitee: invitee.userId,
          invitedBy: by,
          expiresAt: command.expiresAt,
          at: now,
        }),
      ]
    )
  })

const resolving = (
  invitation: Invitation,
  to: 'withdrawn' | 'declined',
  now: DateTime.Utc
): Result.Result<ReadonlyArray<CanopyWrite>, RefusalOf<'InviteNotFound'>> => {
  if (invitation.status === to) return Result.succeed([])
  return invitation.status === 'pending'
    ? Result.succeed([
        CanopyWrite.ResolveInvitation({ id: invitation.id, to, at: now }),
      ])
    : Result.fail(Refusal.InviteNotFound())
}

export const withdrawInvitation = (
  held: Held,
  command: {
    readonly by: string
    readonly invitationId: string
    readonly now: DateTime.Utc
  }
): Decided<{ readonly canopyId: CanopyId }, 'NotMember' | 'InviteNotFound'> =>
  Result.gen(function* () {
    const { by, invitationId, now } = command
    const { canopy, member } = yield* seatOf(held, by)
    const invitation = yield* Result.fromOption(
      Array.findFirst(
        held.invitations,
        (candidate) =>
          candidate.id === invitationId &&
          may(
            member,
            candidate.invitedBy === by
              ? 'withdrawOwnInvitation'
              : 'withdrawInvitationOfMember'
          )
      ),
      () => Refusal.InviteNotFound()
    )
    return decision(
      { canopyId: canopy.id },
      yield* resolving(invitation, 'withdrawn', now)
    )
  })

export const declineInvitation = (
  held: Held,
  command: {
    readonly by: string
    readonly invitationId: string
    readonly now: DateTime.Utc
  }
): Decided<void, 'InviteNotFound'> =>
  Result.gen(function* () {
    const { by, invitationId, now } = command
    const invitation = yield* Result.fromOption(
      Array.findFirst(
        held.invitations,
        (candidate) => candidate.id === invitationId && candidate.invitee === by
      ),
      () => Refusal.InviteNotFound()
    )
    return decision(undefined, yield* resolving(invitation, 'declined', now))
  })

export interface MoveFacts {
  readonly inOpenDelegation: boolean
  readonly overLimit: Option.Option<LimitExceededError>
}

const roomOf = (
  held: Held,
  room: Placement,
  receiver: PlantOwner
): Result.Result<Placement, RefusalOf<'RoomNotFound'>> =>
  Match.value(room).pipe(
    Match.tagsExhaustive({
      Clear: () => Result.succeed(room),
      Put: ({ roomId }) =>
        Array.some(
          held.rooms,
          (candidate) =>
            candidate.id === roomId && Equal.equals(candidate.owner, receiver)
        )
          ? Result.succeed(room)
          : Result.fail(Refusal.RoomNotFound({ roomId })),
    })
  )

const underLimit = (
  plant: HeldPlant,
  facts: Pick<MoveFacts, 'overLimit'>
): Result.Result<void, RefusalOf<'OverLimit'>> =>
  Option.match(
    Option.filter(facts.overLimit, () => takesASlot(plant)),
    {
      onNone: () => Result.void,
      onSome: (error) => Result.fail(Refusal.OverLimit({ error })),
    }
  )

interface Changes {
  readonly writes: ReadonlyArray<CanopyWrite>
  readonly events: ReadonlyArray<CanopyEvent>
}

const moving = (
  plants: ReadonlyArray<HeldPlant>,
  from: PlantOwner,
  to: PlantOwner,
  room: RoomMove
): Changes =>
  Array.match(
    Array.map(plants, (plant) => plant.id),
    {
      onEmpty: () => ({ writes: [], events: [] }),
      onNonEmpty: (plantIds) => ({
        writes: [CanopyWrite.MovePlants({ plantIds, from, to, room })],
        events: [{ _tag: 'PlantsMoved', plantIds, from, to }],
      }),
    }
  )

const moved = (
  plant: HeldPlant,
  to: PlantOwner,
  room: Placement
): Decision<void> => {
  const { writes, events } = moving([plant], plant.owner, to, room)
  return decision(undefined, writes, events)
}

export const sharePlant = (
  held: Held,
  command: {
    readonly by: string
    readonly plantId: string
    readonly room: Placement
    readonly facts: MoveFacts
  }
): Decided<
  void,
  'NotMember' | 'PlantInDelegation' | 'PlantGone' | 'RoomNotFound' | 'OverLimit'
> =>
  Result.gen(function* () {
    const { by, plantId, facts } = command
    const { canopy } = yield* acting(held, by, ['share'])
    if (facts.inOpenDelegation) {
      return yield* Result.fail(Refusal.PlantInDelegation({ plantId }))
    }
    const plant = yield* Result.fromOption(
      Array.findFirst(
        held.plants,
        (candidate) =>
          candidate.id === plantId &&
          Equal.equals(candidate.owner, { _tag: 'User', userId: by })
      ),
      () => Refusal.PlantGone({ plantId })
    )
    const to: PlantOwner = { _tag: 'Canopy', canopyId: canopy.id }
    const room = yield* roomOf(held, command.room, to)
    yield* underLimit(plant, facts)
    return moved(plant, to, room)
  })

const sharedIn = (
  held: Held,
  canopy: CanopyState,
  plantId: string
): Result.Result<HeldPlant, RefusalOf<'NotMember' | 'PlantGone'>> =>
  Result.flatMap(
    Result.fromOption(
      Array.findFirst(held.plants, (candidate) => candidate.id === plantId),
      (): RefusalOf<'NotMember' | 'PlantGone'> => Refusal.PlantGone({ plantId })
    ),
    (plant) =>
      Match.value(plant.owner).pipe(
        Match.tagsExhaustive({
          User: () => Result.fail(Refusal.PlantGone({ plantId })),
          Canopy: ({ canopyId }) =>
            canopyId === canopy.id
              ? Result.succeed(plant)
              : Result.fail(Refusal.NotMember()),
        })
      )
  )

const unshareOf = (
  canopy: CanopyState,
  plant: HeldPlant,
  by: string
): 'unshareOwn' | 'unshareOfMember' | 'unshareOfDeparted' => {
  if (Option.exists(plant.sharer, (sharer) => sharer === by)) {
    return 'unshareOwn'
  }
  return Option.exists(plant.sharer, (sharer) =>
    Option.isSome(memberOf(canopy, sharer))
  )
    ? 'unshareOfMember'
    : 'unshareOfDeparted'
}

export const unsharePlant = (
  held: Held,
  command: {
    readonly by: string
    readonly plantId: string
    readonly room: Placement
    readonly facts: Pick<MoveFacts, 'overLimit'>
  }
): Decided<
  void,
  'NotMember' | 'PlantGone' | 'PlantNotYours' | 'RoomNotFound' | 'OverLimit'
> =>
  Result.gen(function* () {
    const { by, plantId, facts } = command
    const { canopy, member } = yield* seatOf(held, by)
    const plant = yield* sharedIn(held, canopy, plantId)
    if (!may(member, unshareOf(canopy, plant, by))) {
      return yield* Result.fail(Refusal.PlantNotYours())
    }
    const to: PlantOwner = { _tag: 'User', userId: by }
    const room = yield* roomOf(held, command.room, to)
    yield* underLimit(plant, facts)
    return moved(plant, to, room)
  })

export const setMute = (
  held: Held,
  command: {
    readonly by: string
    readonly plantId: string
    readonly muted: boolean
  }
): Decided<void, 'PlantGone'> => {
  const { by, plantId } = command
  const gone = () => Refusal.PlantGone({ plantId })
  return pipe(
    acting(held, by, ['mute']),
    Result.mapError(gone),
    Result.flatMap(({ canopy }) =>
      Result.mapError(sharedIn(held, canopy, plantId), gone)
    ),
    Result.map((plant) => {
      const mute = { userId: by, plantId: plant.id }
      return command.muted
        ? decision(
            undefined,
            [CanopyWrite.Mute(mute)],
            [{ _tag: 'PlantMuted', ...mute }]
          )
        : decision(
            undefined,
            [CanopyWrite.Unmute(mute)],
            [{ _tag: 'PlantUnmuted', ...mute }]
          )
    })
  )
}

const ofUser = (userId: string): PlantOwner => ({ _tag: 'User', userId })

const ofCanopy = (canopy: CanopyState): PlantOwner => ({
  _tag: 'Canopy',
  canopyId: canopy.id,
})

const sharedBy = (held: Held, userId: string): ReadonlyArray<HeldPlant> =>
  Array.filter(held.plants, (plant) =>
    Option.exists(plant.sharer, (sharer) => sharer === userId)
  )

export type SharedPlants = 'return' | 'stay'

const LEAVING_WITH: Record<
  SharedPlants,
  (held: Held, leaver: string) => ReadonlyArray<HeldPlant>
> = {
  return: sharedBy,
  stay: () => [],
}

const accountOf = (held: Held, userId: string): Option.Option<Account> =>
  Option.fromNullishOr(held.accounts.get(userId))

const departure = (
  held: Held,
  canopy: CanopyState,
  leaver: string,
  plants: SharedPlants,
  now: DateTime.Utc
): Changes => {
  const returned = moving(
    LEAVING_WITH[plants](held, leaver),
    ofCanopy(canopy),
    ofUser(leaver),
    RoomMove.Clear()
  )
  return {
    writes: [
      ...returned.writes,
      CanopyWrite.RemoveMember({ canopyId: canopy.id, userId: leaver }),
      CanopyWrite.WithdrawInvitationsSentBy({
        canopyId: canopy.id,
        userId: leaver,
        at: now,
      }),
    ],
    events: returned.events,
  }
}

const dissolution = (
  held: Held,
  canopy: CanopyState,
  heir: string
): Changes => {
  const from = ofCanopy(canopy)
  const sharers = pipe(
    canopy.members,
    Array.map((member) => member.userId),
    Array.filter((userId) => userId !== heir)
  )
  const returned = Array.map(sharers, (sharer) =>
    moving(sharedBy(held, sharer), from, ofUser(sharer), RoomMove.Clear())
  )
  const inherited = moving(
    Array.filter(
      held.plants,
      (plant) =>
        !Option.exists(plant.sharer, (sharer) =>
          Array.contains(sharers, sharer)
        )
    ),
    from,
    ofUser(heir),
    RoomMove.Keep()
  )
  return {
    writes: [
      ...Array.flatMap(returned, (move) => move.writes),
      ...Array.match(
        Array.map(held.rooms, (room) => room.id),
        {
          onEmpty: () => [],
          onNonEmpty: (roomIds) => [
            CanopyWrite.MoveRooms({
              roomIds,
              canopyId: canopy.id,
              toUserId: heir,
            }),
          ],
        }
      ),
      ...inherited.writes,
      CanopyWrite.DeleteCanopy({ canopyId: canopy.id }),
    ],
    events: [
      ...Array.flatMap(returned, (move) => move.events),
      ...inherited.events,
      { _tag: 'CanopyDissolved', canopyId: canopy.id },
    ],
  }
}

export type LeaveOutcome = 'left' | 'dissolved'

export const leave = (
  held: Held,
  command: {
    readonly by: string
    readonly plants: SharedPlants
    readonly reason: Exclude<MemberLeftReason, 'removed'>
    readonly now: DateTime.Utc
  }
): Decided<Noticed<LeaveOutcome>, 'NotMember'> =>
  Result.map(seatOf(held, command.by), ({ canopy }) => {
    const { by, now } = command
    return Option.match(successorOf(canopy, by), {
      onNone: (): Decision<Noticed<LeaveOutcome>> => {
        const { writes, events } = dissolution(held, canopy, by)
        return decision({ value: 'dissolved', notices: [] }, writes, events)
      },
      onSome: (successor): Decision<Noticed<LeaveOutcome>> => {
        const gone = departure(held, canopy, by, command.plants, now)
        return decision(
          {
            value: 'left',
            notices: Array.map(
              Option.toArray(accountOf(held, successor.userId)),
              (to) =>
                Notice.MemberLeft({
                  to,
                  leaverName: pipe(
                    accountOf(held, by),
                    Option.flatMapNullishOr((account) => account.name),
                    Option.getOrNull
                  ),
                  canopyName: canopy.name,
                })
            ),
          },
          [
            ...gone.writes,
            CanopyWrite.RevokeLinks({
              canopyId: canopy.id,
              onlyCreatedBy: Option.some(by),
              at: now,
            }),
            ...(successor.role === 'owner'
              ? []
              : [
                  CanopyWrite.SetOwner({
                    canopyId: canopy.id,
                    userId: successor.userId,
                  }),
                ]),
          ],
          [
            ...gone.events,
            {
              _tag: 'MemberLeft',
              canopyId: canopy.id,
              userId: by,
              reason: command.reason,
            },
          ]
        )
      },
    })
  })

export const removeMember = (
  held: Held,
  command: {
    readonly by: string
    readonly target: string
    readonly now: DateTime.Utc
  }
): Decided<
  Noticed<{ readonly canopyId: CanopyId }>,
  'NotMember' | 'NotOwner' | 'MemberNotFound'
> =>
  Result.gen(function* () {
    const { by, target, now } = command
    const { canopy } = yield* acting(held, by, ['removeMember'])
    const removed = yield* Result.fromOption(
      Option.filter(memberOf(canopy, target), (member) => member.userId !== by),
      () => Refusal.MemberNotFound()
    )
    const gone = departure(held, canopy, removed.userId, 'return', now)
    return decision(
      {
        value: { canopyId: canopy.id },
        notices: Array.map(
          Option.toArray(accountOf(held, removed.userId)),
          (to) => Notice.MemberRemoved({ to, canopyName: canopy.name })
        ),
      },
      [
        ...gone.writes,
        CanopyWrite.RevokeLinks({
          canopyId: canopy.id,
          onlyCreatedBy: Option.none(),
          at: now,
        }),
      ],
      [
        ...gone.events,
        {
          _tag: 'MemberLeft',
          canopyId: canopy.id,
          userId: removed.userId,
          reason: 'removed',
        },
      ]
    )
  })

export const dissolve = (
  held: Held,
  command: { readonly by: string }
): Decided<void, 'NotMember' | 'NotOwner'> =>
  Result.map(acting(held, command.by, ['dissolve']), ({ canopy }) => {
    const { writes, events } = dissolution(held, canopy, command.by)
    return decision(undefined, writes, events)
  })
