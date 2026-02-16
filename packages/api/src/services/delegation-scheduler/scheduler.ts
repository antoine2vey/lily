import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { Array, Effect } from 'effect'

const POLL_INTERVAL = '5 minutes'

export const pollAndTransition = Effect.gen(function* () {
  const delegationRepo = yield* DelegationRepository
  const now = new Date()

  const toActivate = yield* delegationRepo.findAcceptedReadyToActivate(now)
  yield* Effect.forEach(toActivate, (d) =>
    delegationRepo.updateStatus(d.id, 'active')
  )

  if (Array.isNonEmptyArray(toActivate)) {
    yield* Effect.log(`Activated ${toActivate.length} delegations`)
  }

  const toComplete = yield* delegationRepo.findActiveReadyToComplete(now)
  yield* Effect.forEach(toComplete, (d) =>
    delegationRepo.updateStatus(d.id, 'completed', {
      completedAt: now,
    })
  )

  if (Array.isNonEmptyArray(toComplete)) {
    yield* Effect.log(`Completed ${toComplete.length} delegations`)
  }
}).pipe(Effect.withSpan('DelegationScheduler.pollAndTransition'))

export const startDelegationScheduler = Effect.gen(function* () {
  yield* Effect.fork(
    Effect.forever(
      pollAndTransition.pipe(
        Effect.catchAll((error) =>
          Effect.logError('Delegation scheduler error', error)
        ),
        Effect.zipRight(Effect.sleep(POLL_INTERVAL))
      )
    )
  )

  yield* Effect.log('Delegation scheduler started')
})
