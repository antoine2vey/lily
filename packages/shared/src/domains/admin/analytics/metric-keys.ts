import { Schema } from 'effect'

export const AnalyticsMetricKey = Schema.Literal(
  'mrr_estimate',
  'dau_wau_mau',
  'paid_churn_monthly'
)
export type AnalyticsMetricKey = typeof AnalyticsMetricKey.Type

export const ANALYTICS_METRIC_KEYS = {
  mrrEstimate: 'mrr_estimate',
  dauWauMau: 'dau_wau_mau',
  paidChurnMonthly: 'paid_churn_monthly',
} as const

// Shape of the jsonb `value` column per metric key. Used by the API read
// path to decode snapshots produced by the scheduler compute methods.
export const MrrSnapshotValue = Schema.Struct({ cents: Schema.Number })
export type MrrSnapshotValue = typeof MrrSnapshotValue.Type

export const DauSnapshotValue = Schema.Struct({
  dau: Schema.Number,
  wau: Schema.Number,
  mau: Schema.Number,
})
export type DauSnapshotValue = typeof DauSnapshotValue.Type

export const ChurnSnapshotValue = Schema.Struct({
  rate: Schema.Number,
  canceled: Schema.Number,
  activeStart: Schema.Number,
})
export type ChurnSnapshotValue = typeof ChurnSnapshotValue.Type
