import { Schema } from 'effect'
import { CareType } from '../care/types'

export const CareTask = Schema.Struct({
  id: Schema.String,
  plantId: Schema.String,
  plantName: Schema.String,
  plantImageUrl: Schema.NullOr(Schema.String),
  roomName: Schema.NullOr(Schema.String),
  roomIcon: Schema.NullOr(Schema.String),
  type: CareType,
  dueDate: Schema.Date,
  // Authoritative local-day position, computed server-side in the user's
  // profile timezone. The client buckets by these (integer / string equality)
  // instead of re-deriving day boundaries, so every surface agrees by
  // construction. `dueDayOffset`: 0 = today, <0 = overdue, +N = N days ahead.
  // `localDueDate`: YYYY-MM-DD of the due day in the user's timezone.
  dueDayOffset: Schema.Number,
  localDueDate: Schema.String,
  completed: Schema.Boolean,
})

export const CareTasksResponse = Schema.Struct({
  overdue: Schema.Array(CareTask),
  today: Schema.Array(CareTask),
  upcoming: Schema.Array(CareTask),
  completedToday: Schema.Number,
  // The local date (YYYY-MM-DD, user timezone) for each calendar column, index
  // 0 = today. Drives the home weekly calendar's day axis so its columns line
  // up exactly with the buckets above — and so the +N boundary can never drift.
  windowDays: Schema.Array(Schema.String),
})

// Type exports
export type CareTask = typeof CareTask.Type
export type CareTasksResponse = typeof CareTasksResponse.Type
