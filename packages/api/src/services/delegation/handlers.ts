import type { Api } from '@lily/api/api'
import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import { completeDelegation } from '@lily/api/services/delegation/endpoints/complete-delegation'
import { createDelegation } from '@lily/api/services/delegation/endpoints/create-delegation'
import { getDelegatedTasks } from '@lily/api/services/delegation/endpoints/get-delegated-tasks'
import { getDelegation } from '@lily/api/services/delegation/endpoints/get-delegation'
import { getMyDelegations } from '@lily/api/services/delegation/endpoints/get-my-delegations'
import { respondToDelegation } from '@lily/api/services/delegation/endpoints/respond-delegation'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { HttpApiBuilder } from 'effect/http-api'

export const DelegationApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'delegations', (handlers) =>
    handlers
      .handle('createDelegation', ({ payload }) =>
        createDelegation(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('respondToDelegation', ({ params: { delegationId }, payload }) =>
        respondToDelegation(delegationId, payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('cancelDelegation', ({ params: { delegationId } }) =>
        cancelDelegation(delegationId).pipe(withInfraErrorsAsDefect)
      )
      .handle('completeDelegation', ({ params: { delegationId } }) =>
        completeDelegation(delegationId).pipe(withInfraErrorsAsDefect)
      )
      .handle('getDelegation', ({ params: { delegationId } }) =>
        getDelegation(delegationId).pipe(withInfraErrorsAsDefect)
      )
      .handle('getMyDelegations', ({ query: urlParams }) =>
        getMyDelegations(urlParams).pipe(withInfraErrorsAsDefect)
      )
      .handle('getDelegatedTasks', () =>
        getDelegatedTasks.pipe(withInfraErrorsAsDefect)
      )
  )
