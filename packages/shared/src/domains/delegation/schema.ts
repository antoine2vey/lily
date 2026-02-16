import { Schema } from 'effect'
import { PaginatedResponse } from '../common/pagination'

export const DelegationStatus = Schema.Literal(
  'pending',
  'accepted',
  'rejected',
  'active',
  'completed',
  'canceled'
)
export type DelegationStatus = typeof DelegationStatus.Type

export const DelegationPlantSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
  nextWateringAt: Schema.NullOr(Schema.Date),
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
  startDate: Schema.Date,
  endDate: Schema.Date,
  plants: Schema.Array(DelegationPlantSummary),
  respondedAt: Schema.NullOr(Schema.Date),
  canceledAt: Schema.NullOr(Schema.Date),
  completedAt: Schema.NullOr(Schema.Date),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
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
  startDate: Schema.Date,
  endDate: Schema.Date,
  plantCount: Schema.Number,
  createdAt: Schema.Date,
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
  nextWateringAt: Schema.NullOr(Schema.Date),
  nextFertilizationAt: Schema.NullOr(Schema.Date),
  health: Schema.String,
})
export type DelegatedCareTask = typeof DelegatedCareTask.Type

export const DelegationListResponse = PaginatedResponse(DelegationListItem)
export type DelegationListResponse = typeof DelegationListResponse.Type
