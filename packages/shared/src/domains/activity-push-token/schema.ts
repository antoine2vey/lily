import { Schema } from 'effect'

export const ActivityTokenKind = Schema.Literals(['start', 'update'])
export type ActivityTokenKind = typeof ActivityTokenKind.Type

export const ActivityStatus = Schema.Literals(['active', 'ended', 'expired'])
export type ActivityStatus = typeof ActivityStatus.Type

export const ActivityPushToken = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  deviceTokenId: Schema.String,
  kind: ActivityTokenKind,
  activityId: Schema.NullOr(Schema.String),
  token: Schema.String,
  status: ActivityStatus,
  startedAt: Schema.DateFromString,
  endsAt: Schema.NullOr(Schema.DateFromString),
  lastConfirmedAt: Schema.NullOr(Schema.DateFromString),
  lastFailedAt: Schema.NullOr(Schema.DateFromString),
  lastStartSentAt: Schema.NullOr(Schema.DateFromString),
  startActivityId: Schema.NullOr(Schema.String),
  startConfirmedAt: Schema.NullOr(Schema.DateFromString),
  updatedAt: Schema.DateFromString,
})
export type ActivityPushToken = typeof ActivityPushToken.Type

// Client → server when the device gets a push-to-start token.
export const RegisterStartTokenRequest = Schema.Struct({
  startToken: Schema.String,
  deviceTokenId: Schema.String,
})
export type RegisterStartTokenRequest = typeof RegisterStartTokenRequest.Type

// Client → server when ActivityKit streams an update token for a running
// activity (sent separately because the activity itself was started via push).
// `startId` is the activity id the push-to-start carried in its attributes.
// Builds before #367 omit it, and their posts confirm the latest start.
export const RegisterActivityTokenRequest = Schema.Struct({
  activityId: Schema.String,
  updateToken: Schema.String,
  deviceTokenId: Schema.String,
  startId: Schema.optional(Schema.String),
})
export type RegisterActivityTokenRequest =
  typeof RegisterActivityTokenRequest.Type
