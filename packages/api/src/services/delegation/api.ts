import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  CannotDelegateSelfError,
  CreateDelegationRequest,
  DelegatedCareTask,
  Delegation,
  DelegationDateError,
  DelegationInvalidStatusError,
  DelegationListResponse,
  DelegationNotAuthorizedError,
  DelegationNotFoundError,
  DelegationOverlapError,
  LimitExceededError,
  PaginationParams,
  RespondDelegationRequest,
  UserNotFoundError,
} from '@lily/shared'
import { PlantNotAuthorizedError } from '@lily/shared/errors/plant'
import { Schema } from 'effect'

const delegationIdParam = HttpApiSchema.param('delegationId', Schema.UUID)

const DelegationListParams = Schema.Struct({
  ...PaginationParams.fields,
  role: Schema.optionalWith(Schema.String, { default: () => 'both' }),
  status: Schema.optional(Schema.String),
})

export const DelegationApi = HttpApiGroup.make('delegations')
  .add(
    HttpApiEndpoint.post('createDelegation')`/`
      .setPayload(CreateDelegationRequest)
      .addSuccess(Delegation, { status: 201 })
      .addError(LimitExceededError)
      .addError(CannotDelegateSelfError)
      .addError(DelegationDateError)
      .addError(DelegationOverlapError)
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(UserNotFoundError)
  )
  .add(
    HttpApiEndpoint.post('respondToDelegation')`/${delegationIdParam}/respond`
      .setPayload(RespondDelegationRequest)
      .addSuccess(Delegation)
      .addError(DelegationNotFoundError)
      .addError(DelegationNotAuthorizedError)
      .addError(DelegationInvalidStatusError)
  )
  .add(
    HttpApiEndpoint.post('cancelDelegation')`/${delegationIdParam}/cancel`
      .addSuccess(Delegation)
      .addError(DelegationNotFoundError)
      .addError(DelegationNotAuthorizedError)
      .addError(DelegationInvalidStatusError)
  )
  .add(
    HttpApiEndpoint.post('completeDelegation')`/${delegationIdParam}/complete`
      .addSuccess(Delegation)
      .addError(DelegationNotFoundError)
      .addError(DelegationNotAuthorizedError)
      .addError(DelegationInvalidStatusError)
  )
  .add(
    HttpApiEndpoint.get('getDelegation')`/${delegationIdParam}`
      .addSuccess(Delegation)
      .addError(DelegationNotFoundError)
      .addError(DelegationNotAuthorizedError)
  )
  .add(
    HttpApiEndpoint.get('getMyDelegations')`/`
      .setUrlParams(DelegationListParams)
      .addSuccess(DelegationListResponse)
  )
  .add(
    HttpApiEndpoint.get('getDelegatedTasks')`/tasks`.addSuccess(
      Schema.Array(DelegatedCareTask)
    )
  )
  .prefix('/delegations')
  .middleware(Authentication)
