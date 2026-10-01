import { Schema } from 'effect'
import { PaginatedResponse } from '../common/pagination'
import { PlantCareSchedule } from '../plant/schema'

export const DelegationStatus = Schema.Literals([
  'pending',
  'accepted',
  'rejected',
  'active',
  'completed',
  'canceled',
])
export type DelegationStatus = typeof DelegationStatus.Type

export const DelegationPlantSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
  schedules: Schema.Array(PlantCareSchedule),
  health: Schema.String,
})
export type DelegationPlantSummary = typeof DelegationPlantSummary.Type

export const Delegation = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  ownerName: Schema.NullOr(Schema.String),
  ownerImage: Schema.NullOr(Schema.String),
  caretakerId: Schema.String,
  caretakerName: Schema.NullOr(Schema.String),
  caretakerImage: Schema.NullOr(Schema.String),
  status: DelegationStatus,
  message: Schema.NullOr(Schema.String),
  startDate: Schema.DateFromString,
  endDate: Schema.DateFromString,
  plants: Schema.Array(DelegationPlantSummary),
  respondedAt: Schema.NullOr(Schema.DateFromString),
  canceledAt: Schema.NullOr(Schema.DateFromString),
  completedAt: Schema.NullOr(Schema.DateFromString),
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
})
export type Delegation = typeof Delegation.Type

export const DelegationListItem = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  ownerName: Schema.NullOr(Schema.String),
  ownerImage: Schema.NullOr(Schema.String),
  caretakerId: Schema.String,
  caretakerName: Schema.NullOr(Schema.String),
  caretakerImage: Schema.NullOr(Schema.String),
  status: DelegationStatus,
  startDate: Schema.DateFromString,
  endDate: Schema.DateFromString,
  plantCount: Schema.Number,
  createdAt: Schema.DateFromString,
})
export type DelegationListItem = typeof DelegationListItem.Type

export const CreateDelegationRequest = Schema.Struct({
  caretakerId: Schema.String,
  plantIds: Schema.Array(Schema.String),
  startDate: Schema.String,
  endDate: Schema.String,
  message: Schema.optional(Schema.String),
})
export type CreateDelegationRequest = typeof CreateDelegationRequest.Type

export const RespondDelegationRequest = Schema.Struct({
  accept: Schema.Boolean,
})
export type RespondDelegationRequest = typeof RespondDelegationRequest.Type

export const DelegatedCareTask = Schema.Struct({
  delegationId: Schema.String,
  plantId: Schema.String,
  plantName: Schema.String,
  plantImage: Schema.NullOr(Schema.String),
  ownerName: Schema.NullOr(Schema.String),
  schedules: Schema.Array(PlantCareSchedule),
  health: Schema.String,
})
export type DelegatedCareTask = typeof DelegatedCareTask.Type

export const DelegationListResponse = PaginatedResponse(DelegationListItem)
export type DelegationListResponse = typeof DelegationListResponse.Type
