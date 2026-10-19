import type { ILimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { LimitExceededError } from '@lily/shared'
import { Effect, Layer } from 'effect'

interface MockLimitCheckerOptions {
  plantLimitReached?: boolean | undefined
  delegationAccessDenied?: boolean | undefined
}

export const createMockLimitChecker = (
  options: MockLimitCheckerOptions = {}
): Layer.Layer<LimitChecker> => {
  const { plantLimitReached = false, delegationAccessDenied = false } = options

  const checker: ILimitChecker = {
    checkPlantLimit: () =>
      plantLimitReached
        ? Effect.fail(
            new LimitExceededError({
              feature: 'plants',
              limit: 5,
              current: 5,
              message: 'Plant limit reached',
            })
          )
        : Effect.void,

    checkDelegationAccess: () =>
      delegationAccessDenied
        ? Effect.fail(
            new LimitExceededError({
              feature: 'care_delegation',
              limit: 0,
              current: 0,
              message:
                'Care delegation is a premium feature. Upgrade to create delegations.',
            })
          )
        : Effect.void,
  }

  return Layer.succeed(LimitChecker, checker)
}

// Default mock that allows all operations
export const MockLimitCheckerLive = createMockLimitChecker()
