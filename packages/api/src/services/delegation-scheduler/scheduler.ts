import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import { Array, Effect, Option } from 'effect'

const POLL_INTERVAL = '5 minutes'

const getUserLanguage = (
  userRepo: { findById: (id: string) => Effect.Effect<any, any> },
  userId: string
) =>
  Effect.gen(function* () {
    const user = yield* userRepo.findById(userId)
    return Option.getOrElse(
      Option.fromNullable(user?.language),
      () => 'en' as const
    )
  })

export const pollAndTransition = Effect.gen(function* () {
  const delegationRepo = yield* DelegationRepository
  const notificationRepo = yield* NotificationRepository
  const userRepo = yield* UserRepository
  const now = new Date()

  const toActivate = yield* delegationRepo.findAcceptedReadyToActivate(now)
  yield* Effect.forEach(toActivate, (d) =>
    Effect.gen(function* () {
      yield* delegationRepo.updateStatus(d.id, 'active')
      const plants = yield* delegationRepo.getPlantsByDelegation(d.id)
      const ownerLang = yield* getUserLanguage(userRepo, d.ownerId)
      const caretakerLang = yield* getUserLanguage(userRepo, d.caretakerId)

      const ownerContent = buildSimpleContent(
        'delegation_activated',
        { plantCount: plants.length },
        ownerLang
      )
      const caretakerContent = buildSimpleContent(
        'delegation_activated',
        { plantCount: plants.length },
        caretakerLang
      )

      yield* notificationRepo.create({
        userId: d.ownerId,
        type: 'delegation_activated',
        title: ownerContent.title,
        body: ownerContent.body,
        scheduledAt: now,
      })
      yield* notificationRepo.create({
        userId: d.caretakerId,
        type: 'delegation_activated',
        title: caretakerContent.title,
        body: caretakerContent.body,
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
      const ownerLang = yield* getUserLanguage(userRepo, d.ownerId)
      const caretakerLang = yield* getUserLanguage(userRepo, d.caretakerId)

      const ownerContent = buildSimpleContent(
        'delegation_completed',
        { plantCount: plants.length },
        ownerLang
      )
      const caretakerContent = buildSimpleContent(
        'delegation_completed',
        { plantCount: plants.length },
        caretakerLang
      )

      yield* notificationRepo.create({
        userId: d.ownerId,
        type: 'delegation_completed',
        title: ownerContent.title,
        body: ownerContent.body,
        scheduledAt: now,
      })
      yield* notificationRepo.create({
        userId: d.caretakerId,
        type: 'delegation_completed',
        title: caretakerContent.title,
        body: caretakerContent.body,
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
