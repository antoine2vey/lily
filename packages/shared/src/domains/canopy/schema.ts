import { Schema } from 'effect'

export const CANOPY_MAX_MEMBERS = 10
export const CANOPY_NAME_MAX_LENGTH = 50

export const CanopyId = Schema.String.pipe(Schema.brand('CanopyId'))
export type CanopyId = typeof CanopyId.Type

// The one owner of a plant or room. Every access, reminder and limit check
// derives from it.
export const PlantOwner = Schema.TaggedUnion({
  User: { userId: Schema.String },
  Canopy: { canopyId: CanopyId },
})
export type PlantOwner = typeof PlantOwner.Type

export const CanopyMemberRole = Schema.Literals(['owner', 'member'])
export type CanopyMemberRole = typeof CanopyMemberRole.Type

export const CanopyName = Schema.Trim.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(CANOPY_NAME_MAX_LENGTH)
)

export const CanopyRef = Schema.Struct({
  id: CanopyId,
  name: Schema.String,
})
export type CanopyRef = typeof CanopyRef.Type

export const CanopyMember = Schema.Struct({
  userId: Schema.String,
  name: Schema.NullOr(Schema.String),
  image: Schema.NullOr(Schema.String),
  role: CanopyMemberRole,
  joinedAt: Schema.DateFromString,
})
export type CanopyMember = typeof CanopyMember.Type

export const Canopy = Schema.Struct({
  id: CanopyId,
  name: Schema.String,
  timezone: Schema.String,
  latitude: Schema.NullOr(Schema.Number),
  longitude: Schema.NullOr(Schema.Number),
  role: CanopyMemberRole,
  members: Schema.Array(CanopyMember),
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})
export type Canopy = typeof Canopy.Type

export const CanopyResponse = Schema.Struct({
  canopy: Schema.NullOr(Canopy),
})
export type CanopyResponse = typeof CanopyResponse.Type

export const CreateCanopyRequest = Schema.Struct({
  name: CanopyName,
})
export type CreateCanopyRequest = typeof CreateCanopyRequest.Type

export const RenameCanopyRequest = Schema.Struct({
  name: CanopyName,
})
export type RenameCanopyRequest = typeof RenameCanopyRequest.Type

export const UpdateCanopySettingsRequest = Schema.Struct({
  timezone: Schema.optional(Schema.String),
  latitude: Schema.optional(Schema.NullOr(Schema.Number)),
  longitude: Schema.optional(Schema.NullOr(Schema.Number)),
})
export type UpdateCanopySettingsRequest =
  typeof UpdateCanopySettingsRequest.Type

export const CanopyInvite = Schema.Struct({
  url: Schema.String,
  expiresAt: Schema.DateFromString,
})
export type CanopyInvite = typeof CanopyInvite.Type

export const CanopyInvitePreview = Schema.Struct({
  canopyName: Schema.String,
  inviterName: Schema.NullOr(Schema.String),
  memberCount: Schema.Number,
  expiresAt: Schema.DateFromString,
})
export type CanopyInvitePreview = typeof CanopyInvitePreview.Type

export const JoinCanopyRequest = Schema.Struct({
  token: Schema.String,
})
export type JoinCanopyRequest = typeof JoinCanopyRequest.Type

// Sharing or unsharing clears the room; the same sheet offers a room in the
// new scope.
export const MovePlantScopeRequest = Schema.Struct({
  roomId: Schema.optional(Schema.NullOr(Schema.String)),
})
export type MovePlantScopeRequest = typeof MovePlantScopeRequest.Type

export const CanopyPlantMuteRequest = Schema.Struct({
  muted: Schema.Boolean,
})
export type CanopyPlantMuteRequest = typeof CanopyPlantMuteRequest.Type
