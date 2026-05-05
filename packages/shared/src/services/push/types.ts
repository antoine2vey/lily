import { Data, Schema } from 'effect'
import { CareType } from '../../domains/care/types'

// iOS interruption levels (mapped 1:1 onto APS `interruption-level`).
// `time-sensitive` breaks through Focus modes and appears prominently on
// the lock screen — requires the matching entitlement on the iOS app.
export const InterruptionLevel = Schema.Literal(
  'active',
  'critical',
  'passive',
  'time-sensitive'
)
export type InterruptionLevel = typeof InterruptionLevel.Type

// Push message to send to a device
export const PushMessage = Schema.Struct({
  to: Schema.String, // Expo push token
  title: Schema.String,
  body: Schema.String,
  data: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown })
  ),
  sound: Schema.optional(Schema.Literal('default')),
  badge: Schema.optional(Schema.Number),
  interruptionLevel: Schema.optional(InterruptionLevel),
})
export type PushMessage = typeof PushMessage.Type

// Response from push service
export const PushTicket = Schema.Struct({
  id: Schema.String,
  status: Schema.Union(Schema.Literal('ok'), Schema.Literal('error')),
  message: Schema.optional(Schema.String),
})
export type PushTicket = typeof PushTicket.Type

// ============================================================================
// Live Activity (iOS 16.2+, push-to-start requires 17.2+)
//
// The server pre-renders localized strings (`headline`, `subheadline`) and
// ships them in `ContentState`. The widget extension is a pure render layer
// — it has no network and no access to the app's i18next catalog.
// ============================================================================

export const CareGroupContent = Schema.Struct({
  careType: CareType,
  count: Schema.Number,
  firstPlantName: Schema.optional(Schema.String),
  // Localized verb for the care type ("Water", "Arroser") — server-rendered
  // because the widget extension has no access to i18next at runtime.
  label: Schema.String,
})
export type CareGroupContent = typeof CareGroupContent.Type

// Dynamic part of the activity — what the widget redraws on each update.
// `schemaVersion` must be read defensively on the Swift side so older
// builds can still render newer payloads.
export const LiveActivityContentState = Schema.Struct({
  schemaVersion: Schema.Number,
  totalPlants: Schema.Number,
  groups: Schema.Array(CareGroupContent),
  headline: Schema.String,
  subheadline: Schema.optional(Schema.String),
  // Punchy localized title rendered above the headline (e.g. "Your plants
  // miss you" / "Vos plantes vous réclament"). Server-rendered for i18n.
  title: Schema.String,
  // Care tasks the user has logged today; paired with the remaining-task count
  // it lets the widget render a progress bar without a second push round-trip.
  completedToday: Schema.Number,
  updatedAt: Schema.Date,
})
export type LiveActivityContentState = typeof LiveActivityContentState.Type

// Mirrors the Swift `CareTasksAttributes` struct. Name and shape must stay
// in sync with `packages/app/modules/expo-live-activity-lily/ios/CareTasksAttributes.swift`.
export const CARE_TASKS_ATTRIBUTES_TYPE = 'CareTasksAttributes' as const
export const CareTasksAttributes = Schema.Struct({
  userId: Schema.String,
  activityId: Schema.String,
})
export type CareTasksAttributes = typeof CareTasksAttributes.Type

// Optional APS alert to surface the activity on the lock screen at start
// or on significant updates (e.g. a new plant added to the pile).
export const LiveActivityAlert = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  sound: Schema.optional(Schema.Literal('default')),
})
export type LiveActivityAlert = typeof LiveActivityAlert.Type

// Tagged union of the three APNs Live Activity events.
// `to` is the APNs push token — either a push-to-start token (Start) or a
// per-activity update token (Update/End).
export const LiveActivityPushMessage = Schema.Union(
  // `alert` is required on Start: production iOS silently drops push-to-start
  // payloads without an alert (sandbox is permissive — that's why dev builds
  // worked but TestFlight didn't). Apple's stance is that any push-started
  // LA must surface a visible trigger to the user.
  Schema.TaggedStruct('LiveActivityStart', {
    to: Schema.String,
    attributes: CareTasksAttributes,
    contentState: LiveActivityContentState,
    alert: LiveActivityAlert,
  }),
  Schema.TaggedStruct('LiveActivityUpdate', {
    to: Schema.String,
    contentState: LiveActivityContentState,
    alert: Schema.optional(LiveActivityAlert),
  }),
  Schema.TaggedStruct('LiveActivityEnd', {
    to: Schema.String,
    contentState: Schema.optional(LiveActivityContentState),
    dismissalPolicy: Schema.Literal('immediate', 'default'),
  })
)
export type LiveActivityPushMessage = typeof LiveActivityPushMessage.Type

// Error types
export class PushSendError extends Data.TaggedError('PushSendError')<{
  message: string
  cause?: unknown
}> {}

export class PushConfigError extends Data.TaggedError('PushConfigError')<{
  message: string
}> {}

// Terminal token-invalidation error: the APNs provider determined the push
// token is permanently unusable (BadDeviceToken, Unregistered, etc.) and the
// caller should stop using it. For Live Activities this means marking the
// activity_push_tokens row as ended so the next send takes the start path.
export class PushTokenInvalidatedError extends Data.TaggedError(
  'PushTokenInvalidatedError'
)<{
  message: string
  reason: string
}> {}
