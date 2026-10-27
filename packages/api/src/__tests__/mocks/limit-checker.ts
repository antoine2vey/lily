import type { ILimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import { LimitExceededError, type PlantOwner } from '@lily/shared'
import { Effect, Layer } from 'effect'

interface MockLimitCheckerOptions {
  /** A predicate decides per owner; the error names that owner's feature. */
  plantLimitReached?: boolean | ((owner: PlantOwner) => boolean) | undefined
  delegationAccessDenied?: boolean | undefined
  /** Every owner `checkPlantLimit` was asked about, in order. */
  checkedOwners?: PlantOwner[] | undefined
}

export const createMockLimitChecker = (
  options: MockLimitCheckerOptions = {}
): Layer.Layer<LimitChecker> => {
  const { plantLimitReached = false, delegationAccessDenied = false } = options

  const checker: ILimitChecker = {
    checkPlantLimit: (owner) =>
      Effect.suspend(() => {
        options.checkedOwners?.push(owner)
        const reached =
          typeof plantLimitReached === 'function'
            ? plantLimitReached(owner)
            : plantLimitReached
        return reached
          ? Effect.fail(
              new LimitExceededError({
                feature: owner._tag === 'Canopy' ? 'canopy_plants' : 'plants',
                limit: 5,
                current: 5,
                message: 'Plant limit reached',
              })
            )
          : Effect.void
      }),

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
