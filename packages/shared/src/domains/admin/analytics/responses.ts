import { Schema } from 'effect'
import {
  SubscriptionStatus,
  SubscriptionTier,
} from '../../subscriptions/schema'
import { UserStatus } from '../../user/schema'

// ============================================================================
// Shared primitives
// ============================================================================

export const TimeSeriesPoint = Schema.Struct({
  date: Schema.String,
  value: Schema.Number,
})
export type TimeSeriesPoint = typeof TimeSeriesPoint.Type

export const CategoryCount = Schema.Struct({
  label: Schema.String,
  count: Schema.Number,
})
export type CategoryCount = typeof CategoryCount.Type

export const HistogramBucket = Schema.Struct({
  label: Schema.String,
  count: Schema.Number,
})
export type HistogramBucket = typeof HistogramBucket.Type

export const FunnelStep = Schema.Struct({
  label: Schema.String,
  count: Schema.Number,
  pctOfStart: Schema.Number,
})
export type FunnelStep = typeof FunnelStep.Type

// ============================================================================
// #1 Users by status (LIVE)
// ============================================================================

export const UsersByStatusResponse = Schema.Struct({
  total: Schema.Number,
  byStatus: Schema.Array(
    Schema.Struct({
      status: UserStatus,
      count: Schema.Number,
    })
  ),
})
export type UsersByStatusResponse = typeof UsersByStatusResponse.Type

// ============================================================================
// #2 DAU / WAU / MAU
// ============================================================================

export const DauWauMauResponse = Schema.Struct({
  dau: Schema.Number,
  wau: Schema.Number,
  mau: Schema.Number,
  stickiness: Schema.Number,
  trend: Schema.Array(TimeSeriesPoint),
})
export type DauWauMauResponse = typeof DauWauMauResponse.Type

// ============================================================================
// #3 Signup → first plant
// ============================================================================

export const SignupToFirstPlantResponse = Schema.Struct({
  cohortSize: Schema.Number,
  steps: Schema.Array(FunnelStep),
  medianHoursToFirstPlant: Schema.NullOr(Schema.Number),
})
export type SignupToFirstPlantResponse = typeof SignupToFirstPlantResponse.Type

// ============================================================================
// #4 Trial → paid
// ============================================================================

export const TrialToPaidResponse = Schema.Struct({
  trialsStarted: Schema.Number,
  converted: Schema.Number,
  conversionRate: Schema.Number,
  medianDaysToConvert: Schema.NullOr(Schema.Number),
})
export type TrialToPaidResponse = typeof TrialToPaidResponse.Type

// ============================================================================
// #5 Paywall attribution
// ============================================================================

export const PaywallAttributionResponse = Schema.Struct({
  totalConversions: Schema.Number,
  byLimit: Schema.Array(CategoryCount),
})
export type PaywallAttributionResponse = typeof PaywallAttributionResponse.Type

// ============================================================================
// #6 Active subscribers by tier (LIVE)
// ============================================================================

export const ActiveSubscribersByTierResponse = Schema.Struct({
  total: Schema.Number,
  byTier: Schema.Array(
    Schema.Struct({
      tier: SubscriptionTier,
      status: SubscriptionStatus,
      count: Schema.Number,
    })
  ),
})
export type ActiveSubscribersByTierResponse =
  typeof ActiveSubscribersByTierResponse.Type

// ============================================================================
// #7 MRR estimate
// ============================================================================

export const MrrEstimateResponse = Schema.Struct({
  currentCents: Schema.Number,
  trend: Schema.Array(TimeSeriesPoint),
})
export type MrrEstimateResponse = typeof MrrEstimateResponse.Type

// ============================================================================
// #8 Paid churn (monthly)
// ============================================================================

export const PaidChurnResponse = Schema.Struct({
  currentRate: Schema.Number,
  trend: Schema.Array(TimeSeriesPoint),
})
export type PaidChurnResponse = typeof PaidChurnResponse.Type

// ============================================================================
// #9 Plants per user distribution (LIVE)
// ============================================================================

export const PlantsPerUserDistributionResponse = Schema.Struct({
  totalUsers: Schema.Number,
  totalPlants: Schema.Number,
  buckets: Schema.Array(HistogramBucket),
})
export type PlantsPerUserDistributionResponse =
  typeof PlantsPerUserDistributionResponse.Type

// ============================================================================
// #10 Care log volume by type (LIVE)
// ============================================================================

export const CareLogVolumeSeries = Schema.Struct({
  type: Schema.String,
  points: Schema.Array(TimeSeriesPoint),
})
export type CareLogVolumeSeries = typeof CareLogVolumeSeries.Type

export const CareLogVolumeByTypeResponse = Schema.Struct({
  totalInRange: Schema.Number,
  series: Schema.Array(CareLogVolumeSeries),
})
export type CareLogVolumeByTypeResponse =
  typeof CareLogVolumeByTypeResponse.Type

// ============================================================================
// #11 AI chat volume
// ============================================================================

export const AiChatVolumeResponse = Schema.Struct({
  totalMessages: Schema.Number,
  uniqueUsers: Schema.Number,
  trend: Schema.Array(
    Schema.Struct({
      date: Schema.String,
      messages: Schema.Number,
      users: Schema.Number,
    })
  ),
})
export type AiChatVolumeResponse = typeof AiChatVolumeResponse.Type

// ============================================================================
// #12 Diagnosis resolution rate
// ============================================================================

export const DiagnosisResolutionRateResponse = Schema.Struct({
  total: Schema.Number,
  resolved: Schema.Number,
  resolutionRate: Schema.Number,
  medianHoursToResolve: Schema.NullOr(Schema.Number),
})
export type DiagnosisResolutionRateResponse =
  typeof DiagnosisResolutionRateResponse.Type

// ============================================================================
// #13 Notification → care action
// ============================================================================

export const NotificationToCareActionResponse = Schema.Struct({
  remindersSent: Schema.Number,
  actedOnWithin24h: Schema.Number,
  actionRate: Schema.Number,
})
export type NotificationToCareActionResponse =
  typeof NotificationToCareActionResponse.Type

// ============================================================================
// #14 Dead-letter volume (LIVE)
// ============================================================================

export const DeadLetterSeries = Schema.Struct({
  topic: Schema.String,
  points: Schema.Array(TimeSeriesPoint),
})
export type DeadLetterSeries = typeof DeadLetterSeries.Type

export const DeadLetterTopError = Schema.Struct({
  topic: Schema.String,
  error: Schema.String,
  count: Schema.Number,
})
export type DeadLetterTopError = typeof DeadLetterTopError.Type

export const DeadLetterVolumeResponse = Schema.Struct({
  totalInRange: Schema.Number,
  series: Schema.Array(DeadLetterSeries),
  topErrors: Schema.Array(DeadLetterTopError),
})
export type DeadLetterVolumeResponse = typeof DeadLetterVolumeResponse.Type
