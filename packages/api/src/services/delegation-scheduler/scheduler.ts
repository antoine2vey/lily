import type { SqlError } from '@effect/sql/SqlError'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { SimpleNotificationType } from '@lily/api/services/notification-scheduler/translations'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import type { DelegationStatus, LanguageCode } from '@lily/shared'
import { nowAsDate } from '@lily/shared'
import { Array, Effect, Option } from 'effect'

const POLL_INTERVAL = '5 minutes'

const getUserLanguage = (
  userRepo: {
    findById: (
      id: string
    ) => Effect.Effect<{ language: string | null } | null, SqlError>
  },
  userId: string
): Effect.Effect<LanguageCode, SqlError> =>
  Effect.gen(function* () {
    const user = yield* userRepo.findById(userId)
    return Option.getOrElse(
      Option.fromNullable(user?.language as LanguageCode | null),
      () => 'en' as const
    )
  })

const processDelegationBatch = (
  delegations: ReadonlyArray<{
    id: string
    ownerId: string
    caretakerId: string
  }>,
  newStatus: DelegationStatus,
  notificationType: SimpleNotificationType,
  timestamps: Record<string, Date> | undefined,
  now: Date
) =>
  Effect.gen(function* () {
    const delegationRepo = yield* DelegationRepository
    const notificationRepo = yield* NotificationRepository
    const userRepo = yield* UserRepository

    yield* Effect.forEach(delegations, (d) =>
      Effect.gen(function* () {
        yield* delegationRepo.updateStatus(d.id, newStatus, timestamps)
        const plants = yield* delegationRepo.getPlantsByDelegation(d.id)
        const ownerLang = yield* getUserLanguage(userRepo, d.ownerId)
        const caretakerLang = yield* getUserLanguage(userRepo, d.caretakerId)

        const ownerContent = buildSimpleContent(
          notificationType,
          { plantCount: plants.length },
          ownerLang
        )
        const caretakerContent = buildSimpleContent(
          notificationType,
          { plantCount: plants.length },
          caretakerLang
        )

        yield* notificationRepo.create({
          userId: d.ownerId,
          type: notificationType,
          title: ownerContent.title,
          body: ownerContent.body,
          scheduledAt: now,
        })
        yield* notificationRepo.create({
          userId: d.caretakerId,
          type: notificationType,
          title: caretakerContent.title,
          body: caretakerContent.body,
          scheduledAt: now,
        })
      })
    )
  })

export const pollAndTransition = Effect.gen(function* () {
  const delegationRepo = yield* DelegationRepository
  const now = nowAsDate()

  const toActivate = yield* delegationRepo.findAcceptedReadyToActivate(now)
  yield* processDelegationBatch(
    toActivate,
    'active',
    'delegation_activated',
    undefined,
    now
  )

  if (Array.isNonEmptyArray(toActivate)) {
    yield* Effect.log(`Activated ${toActivate.length} delegations`)
  }

  const toComplete = yield* delegationRepo.findActiveReadyToComplete(now)
  yield* processDelegationBatch(
    toComplete,
    'completed',
    'delegation_completed',
    { completedAt: now },
    now
  )

  if (Array.isNonEmptyArray(toComplete)) {
    yield* Effect.log(`Completed ${toComplete.length} delegations`)
  }
}).pipe(Effect.withSpan('DelegationScheduler.pollAndTransition'))

export const startDelegationScheduler = Effect.gen(function* () {
  yield* Effect.fork(
    Effect.forever(
      pollAndTransition.pipe(
        Effect.catchTag('SqlError', (error) =>
          Effect.logError('Delegation scheduler error', error)
        ),
        Effect.zipRight(Effect.sleep(POLL_INTERVAL))
      )
    )
  )

  yield* Effect.log('Delegation scheduler started')
})
