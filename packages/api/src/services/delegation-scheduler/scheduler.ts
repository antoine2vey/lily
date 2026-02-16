import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { Array, Effect } from 'effect'

const POLL_INTERVAL = '5 minutes'

export const pollAndTransition = Effect.gen(function* () {
  const delegationRepo = yield* DelegationRepository
  const notificationRepo = yield* NotificationRepository
  const now = new Date()

  const toActivate = yield* delegationRepo.findAcceptedReadyToActivate(now)
  yield* Effect.forEach(toActivate, (d) =>
    Effect.gen(function* () {
      yield* delegationRepo.updateStatus(d.id, 'active')
      const plants = yield* delegationRepo.getPlantsByDelegation(d.id)
      yield* notificationRepo.create({
        userId: d.ownerId,
        type: 'delegation_activated',
        title: 'Delegation started',
        body: `Care delegation for ${plants.length} plants has started`,
        scheduledAt: now,
      })
      yield* notificationRepo.create({
        userId: d.caretakerId,
        type: 'delegation_activated',
        title: 'Delegation started',
        body: `Care delegation for ${plants.length} plants has started`,
        scheduledAt: now,
      })
    })
  )

  if (Array.isNonEmptyArray(toActivate)) {
    yield* Effect.log(`Activated ${toActivate.length} delegations`)
  }

  const toComplete = yield* delegationRepo.findActiveReadyToComplete(now)
  yield* Effect.forEach(toComplete, (d) =>
    Effect.gen(function* () {
      yield* delegationRepo.updateStatus(d.id, 'completed', {
        completedAt: now,
      })
      const plants = yield* delegationRepo.getPlantsByDelegation(d.id)
      yield* notificationRepo.create({
        userId: d.ownerId,
        type: 'delegation_completed',
        title: 'Delegation ended',
        body: `Care delegation for ${plants.length} plants has ended`,
        scheduledAt: now,
      })
      yield* notificationRepo.create({
        userId: d.caretakerId,
        type: 'delegation_completed',
        title: 'Delegation ended',
        body: `Care delegation for ${plants.length} plants has ended`,
        scheduledAt: now,
      })
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
