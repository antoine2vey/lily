import { Schema } from 'effect'

export const CareTaskType = Schema.Union(
  Schema.Literal('water'),
  Schema.Literal('fertilize')
)

export const CareTask = Schema.Struct({
  id: Schema.String,
  plantId: Schema.String,
  plantName: Schema.String,
  plantImageUrl: Schema.NullOr(Schema.String),
  roomName: Schema.NullOr(Schema.String),
  roomIcon: Schema.NullOr(Schema.String),
  type: CareTaskType,
  dueDate: Schema.Date,
  completed: Schema.Boolean,
})

export const CareTasksResponse = Schema.Struct({
  overdue: Schema.Array(CareTask),
  today: Schema.Array(CareTask),
  thisWeek: Schema.Array(CareTask),
})

// Type exports
export type CareTaskType = typeof CareTaskType.Type
export type CareTask = typeof CareTask.Type
export type CareTasksResponse = typeof CareTasksResponse.Type
