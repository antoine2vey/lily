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
  completed: Schema.Boolean,
})

export const CareTasksResponse = Schema.Struct({
  overdue: Schema.Array(CareTask),
  today: Schema.Array(CareTask),
  upcoming: Schema.Array(CareTask),
  completedToday: Schema.Number,
})

// Type exports
export type CareTask = typeof CareTask.Type
export type CareTasksResponse = typeof CareTasksResponse.Type
