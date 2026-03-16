import type { SqlError } from '@effect/sql/SqlError'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import type { SimpleNotificationType } from '@lily/api/services/notification-scheduler/translations'
import type { DelegationStatus, LanguageCode } from '@lily/shared'
import { nowAsDate } from '@lily/shared'
import { Array, Effect, Option } from 'effect'

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
  timestamps: Record<string, Date> | undefined
) =>
  Effect.gen(function* () {
    const delegationRepo = yield* DelegationRepository
    const userRepo = yield* UserRepository

    const results = yield* Effect.forEach(delegations, (d) =>
      Effect.gen(function* () {
        yield* delegationRepo.updateStatus(d.id, newStatus, timestamps)
        const plants = yield* delegationRepo.getPlantsByDelegation(d.id)
        const ownerLang = yield* getUserLanguage(userRepo, d.ownerId)
        const caretakerLang = yield* getUserLanguage(userRepo, d.caretakerId)

        yield* scheduleSimpleNotification(
          notificationType,
          d.ownerId,
          { plantCount: plants.length },
          ownerLang
        )
        yield* scheduleSimpleNotification(
          notificationType,
          d.caretakerId,
          { plantCount: plants.length },
          caretakerLang
        )
        return 1 as const
      }).pipe(
        Effect.catchTags({
          SqlError: (e) =>
            Effect.logWarning(
              '[delegation-scheduler] Failed to process delegation',
              { delegationId: d.id, error: String(e) }
            ).pipe(Effect.as(0 as const)),
        })
      )
    )

    const succeeded = Array.reduce(results, 0, (acc, n) => acc + n)
    if (delegations.length > 0 && succeeded < delegations.length) {
      yield* Effect.logWarning(
        `[delegation-scheduler] Processed ${succeeded}/${delegations.length} delegations`
      )
    }
  })

export const pollAndTransition = Effect.gen(function* () {
  const delegationRepo = yield* DelegationRepository
  const now = nowAsDate()

  const toActivate = yield* delegationRepo.findAcceptedReadyToActivate(now)
  yield* processDelegationBatch(
    toActivate,
    'active',
    'delegation_activated',
    undefined
  )

  if (Array.isNonEmptyArray(toActivate)) {
    yield* Effect.log(`Activated ${toActivate.length} delegations`)
  }

  const toComplete = yield* delegationRepo.findActiveReadyToComplete(now)
  yield* processDelegationBatch(
    toComplete,
    'completed',
    'delegation_completed',
    { completedAt: now }
  )

  if (Array.isNonEmptyArray(toComplete)) {
    yield* Effect.log(`Completed ${toComplete.length} delegations`)
  }
}).pipe(Effect.withSpan('DelegationScheduler.pollAndTransition'))

export const startDelegationScheduler = createScheduler({
  name: 'delegation-scheduler',
  interval: '5 minutes',
  runOnStartup: false,
  task: pollAndTransition,
})
