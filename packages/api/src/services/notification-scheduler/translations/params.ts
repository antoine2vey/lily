import { UsageField } from '@lily/shared'
import { GiftDuration } from '@lily/shared/admin'
import type { DeferredCareType, NotificationTopic } from '@lily/shared/server'
import { Schema } from 'effect'

export type SimpleNotificationType = Exclude<
  NotificationTopic,
  DeferredCareType
>

// A sender with no name on their account has no senderName, and each
// language words that absence itself.
const Sender = Schema.Struct({ senderName: Schema.optional(Schema.String) })

const PlantCount = Schema.Struct({ plantCount: Schema.Finite })
const CanopyEvent = Schema.Struct({
  ...Sender.fields,
  canopyName: Schema.String,
})

/** What each topic's row stores in `params`: facts, never words. */
export const NOTIFICATION_PARAMS = {
  new_follower: Sender,
  nudge_to_water: Sender,
  delegation_request: Sender,
  delegation_accepted: Sender,
  delegation_rejected: Sender,
  delegation_canceled: Schema.Struct({
    senderName: Schema.optional(Schema.String),
    unanswered: Schema.optional(Schema.Literal(true)),
  }),
  delegation_activated: PlantCount,
  delegation_completed: PlantCount,
  canopy_member_joined: CanopyEvent,
  canopy_member_removed: Schema.Struct({ canopyName: Schema.String }),
  canopy_member_left: CanopyEvent,
  canopy_invitation: CanopyEvent,
  daily_tip: Schema.Struct({ tipTitle: Schema.String, tipBody: Schema.String }),
  inactivity_nudge: PlantCount,
  photo_reminder: Schema.Struct({
    plantName: Schema.String,
    daysSincePhoto: Schema.Finite,
  }),
  plant_parent_milestone: Schema.Struct({ daysSinceJoin: Schema.Finite }),
  gift_subscription: Schema.Struct({ duration: GiftDuration }),
  resubscribe_nudge: PlantCount,
  streak_at_risk: Schema.Struct({
    streakCount: Schema.Finite,
    plantName: Schema.optional(Schema.String),
  }),
  streak_milestone: Schema.Struct({ streakCount: Schema.Finite }),
  weekly_recap: Schema.Struct({
    tasksCompleted: Schema.Finite,
    streakCount: Schema.Finite,
    healthyCount: Schema.Finite,
  }),
  trial_ending: Schema.Struct({ trialDaysLeft: Schema.Finite }),
  approaching_limit: Schema.Struct({
    usageCount: Schema.Finite,
    usageMax: Schema.Finite,
    feature: UsageField,
  }),
  plant_anniversary: Schema.Struct({
    plantName: Schema.String,
    anniversaryMonths: Schema.Finite,
    plantAddedAt: Schema.DateFromString,
  }),
} as const satisfies Record<SimpleNotificationType, Schema.Top>

export type ParamsOf<T extends SimpleNotificationType> =
  (typeof NOTIFICATION_PARAMS)[T]['Type']

// Rows queued by earlier releases, which stored words where these topics now
// store facts. Delivery renders them through each language's legacy
// templates. Drop this table and those templates one release after the
// release that stopped writing them, once those rows have drained.
export const LEGACY_PARAMS = {
  approaching_limit: Schema.Struct({
    usageCount: Schema.Finite,
    usageMax: Schema.Finite,
    featureName: Schema.String,
  }),
  gift_subscription: Schema.Struct({ giftDuration: Schema.String }),
  plant_anniversary: Schema.Union([
    Schema.Struct({
      plantName: Schema.String,
      anniversaryMonths: Schema.Finite,
      dateAdded: Schema.String,
    }),
    Schema.Struct({
      plantName: Schema.String,
      anniversaryDuration: Schema.String,
      dateAdded: Schema.String,
    }),
  ]),
} as const satisfies Partial<Record<SimpleNotificationType, Schema.Top>>

export type LegacyTopic = keyof typeof LEGACY_PARAMS

export type LegacyParamsOf<T extends LegacyTopic> =
  (typeof LEGACY_PARAMS)[T]['Type']
