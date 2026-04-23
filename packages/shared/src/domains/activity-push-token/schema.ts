import { Schema } from 'effect'

export const ActivityTokenKind = Schema.Literal('start', 'update')
export type ActivityTokenKind = typeof ActivityTokenKind.Type

export const ActivityStatus = Schema.Literal('active', 'ended', 'expired')
export type ActivityStatus = typeof ActivityStatus.Type

export const ActivityPushToken = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  deviceTokenId: Schema.String,
  kind: ActivityTokenKind,
  activityId: Schema.NullOr(Schema.String),
  token: Schema.String,
  status: ActivityStatus,
  startedAt: Schema.Date,
  endsAt: Schema.NullOr(Schema.Date),
  updatedAt: Schema.Date,
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
export const RegisterActivityTokenRequest = Schema.Struct({
  activityId: Schema.String,
  updateToken: Schema.String,
  deviceTokenId: Schema.String,
})
export type RegisterActivityTokenRequest =
  typeof RegisterActivityTokenRequest.Type
