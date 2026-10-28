import { Schema } from 'effect'
import { CareType } from '../care/types'
import { PaginatedResponse } from '../common/pagination'

// Re-export errors for convenient imports
export { CareLogNotFoundError } from './errors'

// Care log schemas
export const CareLog = Schema.Struct({
  id: Schema.String,
  type: CareType,
  notes: Schema.optional(Schema.String),
  date: Schema.DateFromString,
  photoUrl: Schema.optional(Schema.String),
  plantId: Schema.String,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})

export const CareLogCreateRequest = Schema.Struct({
  type: CareType,
  notes: Schema.optional(Schema.String),
  date: Schema.optional(Schema.DateFromString),
  photoUrl: Schema.optional(Schema.String),
})

export const CareLogUpdateRequest = Schema.Struct({
  notes: Schema.optional(Schema.String),
  date: Schema.optional(Schema.DateFromString),
  photoUrl: Schema.optional(Schema.String),
})

export const CareLogPerformer = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
})

export const CareLogHistoryItem = Schema.Struct({
  ...CareLog.fields,
  performedBy: Schema.NullOr(CareLogPerformer),
})

// Care logs list response - uses standard pagination format
export const CareLogsListResponse = PaginatedResponse(CareLogHistoryItem)
export type CareLogsListResponse = typeof CareLogsListResponse.Type

// Recent activity schema - includes plant info for display
export const RecentActivity = Schema.Struct({
  id: Schema.String,
  type: CareType,
  plantId: Schema.String,
  plantName: Schema.String,
  plantImageUrl: Schema.optional(Schema.String),
  date: Schema.DateFromString,
  notes: Schema.optional(Schema.String),
})

export const RecentActivitiesListResponse = Schema.Struct({
  items: Schema.Array(RecentActivity),
})
export type RecentActivitiesListResponse =
  typeof RecentActivitiesListResponse.Type

// Type exports
export type CareLog = typeof CareLog.Type
export type CareLogPerformer = typeof CareLogPerformer.Type
export type CareLogHistoryItem = typeof CareLogHistoryItem.Type
export type CareLogCreateRequest = typeof CareLogCreateRequest.Type
export type CareLogUpdateRequest = typeof CareLogUpdateRequest.Type
export type RecentActivity = typeof RecentActivity.Type
