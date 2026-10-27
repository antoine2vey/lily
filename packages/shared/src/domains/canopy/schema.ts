import { DateTime, Option, Schema } from 'effect'

export const CANOPY_MAX_MEMBERS = 10
export const CANOPY_NAME_MAX_LENGTH = 50
export const CANOPY_INVITE_TTL_DAYS = 7
export const CANOPY_JOIN_URL_PREFIX = 'https://withlily.app/join/'

export const CanopyId = Schema.String.pipe(Schema.brand('CanopyId'))
export type CanopyId = typeof CanopyId.Type

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

export const CanopyActiveInvite = Schema.Struct({
  expiresAt: Schema.DateFromString,
})
export type CanopyActiveInvite = typeof CanopyActiveInvite.Type

export const Canopy = Schema.Struct({
  id: CanopyId,
  name: Schema.String,
  timezone: Schema.String,
  latitude: Schema.NullOr(Schema.Number),
  longitude: Schema.NullOr(Schema.Number),
  role: CanopyMemberRole,
  members: Schema.Array(CanopyMember),
  invite: Schema.NullOr(CanopyActiveInvite),
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

export const CanopyTimezone = Schema.String.check(
  Schema.makeFilter(
    (zone) =>
      Option.isSome(DateTime.zoneMakeNamed(zone)) || 'an IANA time zone',
    { identifier: 'CanopyTimezone' }
  )
)

export const Latitude = Schema.Number.check(
  Schema.isBetween({ minimum: -90, maximum: 90 })
)
export const Longitude = Schema.Number.check(
  Schema.isBetween({ minimum: -180, maximum: 180 })
)

/** Any member renames; the timezone and location need the owner. */
export const UpdateCanopyRequest = Schema.Struct({
  name: Schema.optional(CanopyName),
  timezone: Schema.optional(CanopyTimezone),
  latitude: Schema.optional(Schema.NullOr(Latitude)),
  longitude: Schema.optional(Schema.NullOr(Longitude)),
})
export type UpdateCanopyRequest = typeof UpdateCanopyRequest.Type

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

export const CanopyInviteTokenRequest = Schema.Struct({
  token: Schema.String,
})
export type CanopyInviteTokenRequest = typeof CanopyInviteTokenRequest.Type

export const MovePlantScopeRequest = Schema.Struct({
  roomId: Schema.optionalKey(Schema.String),
})
export type MovePlantScopeRequest = typeof MovePlantScopeRequest.Type
