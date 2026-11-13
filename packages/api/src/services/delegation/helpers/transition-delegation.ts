import { Dirty, Reminders } from '@lily/api/contexts/reminders'
import type { Outbox } from '@lily/api/kernel/outbox'
import {
  type DelegationPlantRow,
  DelegationRepository,
  type DelegationRow,
} from '@lily/api/repositories/delegation.repository'
import {
  DelegationInvalidStatusError,
  DelegationNotFoundError,
  type DelegationStatus,
} from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Moves a delegation from one of `from` to `to` in a single conditional
 * UPDATE. When no row comes back the status changed under us (a scheduler
 * tick or the other party), so the error reports the status the row has now.
 */
export const transitionDelegation = (params: {
  delegationId: string
  from: readonly DelegationStatus[]
  to: DelegationStatus
  expectedStatus: string
  message: string
  timestamps?: {
    respondedAt?: Date | undefined
    canceledAt?: Date | undefined
    completedAt?: Date | undefined
  }
}): Effect.Effect<
  DelegationRow,
  SqlError | DelegationInvalidStatusError | DelegationNotFoundError,
  DelegationRepository
> =>
  Effect.gen(function* () {
    const delegationRepo = yield* DelegationRepository
    const transitioned = yield* delegationRepo.transitionStatus(
      params.delegationId,
      params.from,
      params.to,
      params.timestamps
    )
    if (transitioned) return transitioned

    const current = yield* delegationRepo.findById(params.delegationId)
    return yield* pipe(
      Option.fromNullishOr(current),
      Option.match({
        onNone: () =>
          new DelegationNotFoundError({ delegationId: params.delegationId }),
        onSome: (row) =>
          new DelegationInvalidStatusError({
            currentStatus: row.status,
            expectedStatus: params.expectedStatus,
            message: params.message,
          }),
      })
    )
  })

/**
 * A delegation that enters or leaves `active` changes who is reminded of its
 * plants. Run it in the transaction of the transition, so the request exists
 * if and only if the new status does.
 */
export const plantsHandedOver = (
  transitioned: ReadonlyArray<DelegationRow>
): Effect.Effect<
  ReadonlyArray<readonly [DelegationRow, ReadonlyArray<DelegationPlantRow>]>,
  SqlError,
  DelegationRepository | Outbox
> =>
  Effect.gen(function* () {
    const delegationRepo = yield* DelegationRepository
    const handedOver = yield* Effect.forEach(transitioned, (delegation) =>
      Effect.map(
        delegationRepo.getPlantsByDelegation(delegation.id),
        (plants) => [delegation, plants] as const
      )
    )
    const plantIds = Array.dedupe(
      Array.flatMap(handedOver, ([, plants]) =>
        Array.map(plants, (plant) => plant.id)
      )
    )
    if (Array.isReadonlyArrayNonEmpty(plantIds)) {
      yield* Reminders.request(Dirty.Plants({ plantIds }))
    }
    return handedOver
  })
