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
import { Effect, Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const delegationIdParam = Schema.String.check(Schema.isGUID())

const DelegationListParams = Schema.Struct({
  ...PaginationParams.fields,
  role: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('both')),
    Schema.withConstructorDefault(Effect.succeed('both'))
  ),
  status: Schema.optional(Schema.String),
})

export const DelegationApi = HttpApiGroup.make('delegations')
  .add(
    HttpApiEndpoint.post('createDelegation', '/', {
      payload: CreateDelegationRequest,
      success: Delegation.pipe(HttpApiSchema.status(201)),
      error: [
        LimitExceededError,
        CannotDelegateSelfError,
        DelegationDateError,
        DelegationOverlapError,
        DelegationNotFoundError,
        PlantNotAuthorizedError,
        UserNotFoundError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post('respondToDelegation', '/:delegationId/respond', {
      params: { delegationId: delegationIdParam },
      payload: RespondDelegationRequest,
      success: Delegation,
      error: [
        DelegationNotFoundError,
        DelegationNotAuthorizedError,
        DelegationInvalidStatusError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post('cancelDelegation', '/:delegationId/cancel', {
      params: { delegationId: delegationIdParam },
      success: Delegation,
      error: [
        DelegationNotFoundError,
        DelegationNotAuthorizedError,
        DelegationInvalidStatusError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post('completeDelegation', '/:delegationId/complete', {
      params: { delegationId: delegationIdParam },
      success: Delegation,
      error: [
        DelegationNotFoundError,
        DelegationNotAuthorizedError,
        DelegationInvalidStatusError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.get('getDelegation', '/:delegationId', {
      params: { delegationId: delegationIdParam },
      success: Delegation,
      error: [DelegationNotFoundError, DelegationNotAuthorizedError],
    })
  )
  .add(
    HttpApiEndpoint.get('getMyDelegations', '/', {
      query: DelegationListParams,
      success: DelegationListResponse,
    })
  )
  .add(
    HttpApiEndpoint.get('getDelegatedTasks', '/tasks', {
      success: Schema.Array(DelegatedCareTask),
    })
  )
  .prefix('/delegations')
  .middleware(Authentication)
