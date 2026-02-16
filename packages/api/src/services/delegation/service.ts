import { cancelDelegation } from '@lily/api/services/delegation/endpoints/cancel-delegation'
import { completeDelegation } from '@lily/api/services/delegation/endpoints/complete-delegation'
import { createDelegation } from '@lily/api/services/delegation/endpoints/create-delegation'
import { getDelegatedTasks } from '@lily/api/services/delegation/endpoints/get-delegated-tasks'
import { getDelegation } from '@lily/api/services/delegation/endpoints/get-delegation'
import { getMyDelegations } from '@lily/api/services/delegation/endpoints/get-my-delegations'
import { respondToDelegation } from '@lily/api/services/delegation/endpoints/respond-delegation'
import { Effect } from 'effect'

export class DelegationService extends Effect.Service<DelegationService>()(
  'DelegationService',
  {
    effect: Effect.succeed({
      createDelegation,
      respondToDelegation,
      cancelDelegation,
      completeDelegation,
      getDelegation,
      getMyDelegations,
      getDelegatedTasks,
    }),
  }
) {}
