import { Data, Schema } from 'effect'

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

// Error types
export class PushSendError extends Data.TaggedError('PushSendError')<{
  message: string
  cause?: unknown
}> {}

export class PushConfigError extends Data.TaggedError('PushConfigError')<{
  message: string
}> {}
