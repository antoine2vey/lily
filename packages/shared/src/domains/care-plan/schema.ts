import { Schema } from 'effect'
import { CareType } from '../care/types'

/** Upper bound on steps per plan; enforced in the chat tool schema. */
export const CARE_PLAN_MAX_STEPS = 8

export const CarePlanStatus = Schema.Literal(
  'proposed',
  'accepted',
  'completed',
  'dismissed'
)
export type CarePlanStatus = typeof CarePlanStatus.Type

export const CarePlanSource = Schema.Literal('ai', 'user')
export type CarePlanSource = typeof CarePlanSource.Type

export const CarePlanStep = Schema.Struct({
  id: Schema.String,
  planId: Schema.String,
  position: Schema.Number,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  // Present when the step maps onto the recurring schedule model. Accepting
  // the plan moves that schedule's next date; completing the step runs the
  // regular care flow and links the resulting care log below.
  careType: Schema.optional(CareType),
  dueDate: Schema.optional(Schema.Date),
  completedAt: Schema.optional(Schema.Date),
  careLogId: Schema.optional(Schema.String),
})
export type CarePlanStep = typeof CarePlanStep.Type

export const CarePlan = Schema.Struct({
  id: Schema.String,
  plantId: Schema.String,
  plantName: Schema.String,
  plantImageUrl: Schema.NullOr(Schema.String),
  userId: Schema.String,
  chatMessageId: Schema.optional(Schema.String),
  diagnosisId: Schema.optional(Schema.String),
  title: Schema.String,
  source: CarePlanSource,
  status: CarePlanStatus,
  steps: Schema.Array(CarePlanStep),
  acceptedAt: Schema.optional(Schema.Date),
  completedAt: Schema.optional(Schema.Date),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})
export type CarePlan = typeof CarePlan.Type

export const CarePlanListResponse = Schema.Struct({
  items: Schema.Array(CarePlan),
})
export type CarePlanListResponse = typeof CarePlanListResponse.Type

export const CarePlanListParams = Schema.Struct({
  status: Schema.optional(CarePlanStatus),
})
export type CarePlanListParams = typeof CarePlanListParams.Type
