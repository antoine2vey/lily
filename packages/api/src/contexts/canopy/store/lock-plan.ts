import { Data, Option } from 'effect'

export type Find = Data.TaggedEnum<{
  None: Record<never, never>
  OfMember: { readonly userId: string }
  ByLink: { readonly tokenHash: string }
  ByInvitation: { readonly invitationId: string }
}>
export const Find = Data.taggedEnum<Find>()

export type InvitationScope = Data.TaggedEnum<{
  None: Record<never, never>
  One: { readonly invitationId: string }
  OfInvitee: { readonly invitee: string }
  All: Record<never, never>
}>
export const InvitationScope = Data.taggedEnum<InvitationScope>()

export type RoomScope = Data.TaggedEnum<{
  None: Record<never, never>
  Pin: { readonly roomId: string }
  OfCanopy: Record<never, never>
}>
export const RoomScope = Data.taggedEnum<RoomScope>()

export type PlantScope = Data.TaggedEnum<{
  None: Record<never, never>
  Move: { readonly plantId: string }
  Pin: { readonly plantId: string }
  OfCanopy: Record<never, never>
  Leaver: { readonly userId: string }
}>
export const PlantScope = Data.taggedEnum<PlantScope>()

export interface LockPlan {
  readonly actor: Option.Option<string>
  readonly canopy: Find
  readonly absenceOf: Option.Option<string>
  readonly accounts: ReadonlyArray<string>
  /**
   * `pin` reads the account of every member `FOR KEY SHARE`, for a command
   * that deletes what members wait to be told and then writes a row that
   * names one of them. The foreign key of that row takes the same lock, and
   * a settings save holds the account before it deletes its notifications.
   */
  readonly members: 'read' | 'pin'
  readonly invitations: InvitationScope
  /** Before plants, as a room delete takes its row and then the plants in it. */
  readonly rooms: RoomScope
  readonly plants: PlantScope
}

const LOCK_NOTHING: LockPlan = {
  actor: Option.none(),
  canopy: Find.None(),
  absenceOf: Option.none(),
  accounts: [],
  members: 'read',
  invitations: InvitationScope.None(),
  rooms: RoomScope.None(),
  plants: PlantScope.None(),
}

export const lockPlan = (classes: Partial<LockPlan>): LockPlan => ({
  ...LOCK_NOTHING,
  ...classes,
})
