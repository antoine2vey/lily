import {
  type Account,
  type CanopyState,
  type Held,
  type Location,
  type Member,
  memberOf,
} from '@lily/api/contexts/canopy/domain/canopy'
import type { CanopyEvent } from '@lily/api/contexts/canopy/domain/events'
import type { Decision as KernelDecision } from '@lily/api/kernel/transact'
import type {
  CanopyId,
  CanopyInvitationStatus,
  CanopyMemberRole,
  LimitExceededError,
  PlantOwner,
  ZoneName,
} from '@lily/shared'
import { Array, Data, type DateTime, Option, pipe, Result } from 'effect'

export interface CanopyChanges {
  readonly name: Option.Option<string>
  readonly timezone: Option.Option<ZoneName>
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
    readonly timezone: ZoneName
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
  WithdrawInvitationsSentByOrTo: {
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

export type Decision<A> = KernelDecision<CanopyWrite, CanopyEvent, A, Notice>
export type Decided<A, R extends Refusal['_tag']> = Result.Result<
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

export const seatOf = (
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

export const may = (member: Member, action: CanopyAction): boolean =>
  Array.contains<CanopyMemberRole>(MAY[action], member.role)

export const acting = <A extends CanopyAction>(
  held: Held,
  by: string,
  actions: ReadonlyArray<A>
): Result.Result<Seat, RefusalOf<'NotMember'> | RefusalOf<RoleRefusal<A>>> =>
  Result.flatMap(seatOf(held, by), (seat) =>
    Array.every(actions, (action) => may(seat.member, action))
      ? Result.succeed(seat)
      : Result.fail(Refusal.NotOwner() as RefusalOf<RoleRefusal<A>>)
  )
