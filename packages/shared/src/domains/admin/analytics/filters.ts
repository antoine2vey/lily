import { Schema } from 'effect'

/**
 * Universal analytics filter accepted by every time-series endpoint.
 *
 * Passed as URL parameters. Both bounds are optional — handlers default to
 * `to = now()` and `from = now() - 30d` when omitted.
 *
 * All aggregations use UTC day boundaries; `users.timezone` is not applied on
 * admin dashboards to keep a single canonical day across the whole system.
 */
export const AnalyticsFilters = Schema.Struct({
  from: Schema.optional(Schema.String),
  to: Schema.optional(Schema.String),
})
export type AnalyticsFilters = typeof AnalyticsFilters.Type

export const ANALYTICS_TZ = 'UTC'
