import { transact } from '@lily/api/kernel/transact'
import { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { plantsHandedOver } from '@lily/api/services/delegation/helpers/transition-delegation'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  dispatchAll,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import type { DelegationStatus, LanguageCode } from '@lily/shared'
import { nowAsDate } from '@lily/shared'
import { Array, Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

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
      Option.fromNullishOr(user?.language as LanguageCode | null),
      () => 'en' as const
    )
  })

interface Transition {
  readonly from: DelegationStatus
  readonly to: DelegationStatus
  readonly notificationType: 'delegation_activated' | 'delegation_completed'
  readonly timestamps: Record<string, Date> | undefined
}

const transitionTogether = (
  delegations: ReadonlyArray<{ readonly id: string }>,
  transition: Transition
) =>
  Effect.gen(function* () {
    const delegationRepo = yield* DelegationRepository
    const userRepo = yield* UserRepository

    const recorded = yield* transact(
      Effect.gen(function* () {
        const transitioned = yield* Effect.forEach(delegations, (d) =>
          Effect.map(
            delegationRepo.transitionStatus(
              d.id,
              [transition.from],
              transition.to,
              transition.timestamps
            ),
            Option.fromNullishOr
          ).pipe(
            Effect.tap(
              Option.match({
                onNone: () =>
                  Effect.log(
                    `[delegation-scheduler] Skipped ${d.id}: no longer ${transition.from}`
                  ),
                onSome: () => Effect.void,
              })
            )
          )
        )
        const handedOver = yield* plantsHandedOver(Array.getSomes(transitioned))
        return yield* Effect.forEach(handedOver, ([delegation, plants]) =>
          Effect.gen(function* () {
            const ownerLang = yield* getUserLanguage(
              userRepo,
              delegation.ownerId
            )
            const caretakerLang = yield* getUserLanguage(
              userRepo,
              delegation.caretakerId
            )
            const metadata = { delegationId: delegation.id }
            return yield* Effect.all([
              recordNotification(
                transition.notificationType,
                delegation.ownerId,
                { plantCount: plants.length },
                ownerLang,
                metadata
              ),
              recordNotification(
                transition.notificationType,
                delegation.caretakerId,
                { plantCount: plants.length },
                caretakerLang,
                metadata
              ),
            ])
          })
        )
      })
    )
    yield* dispatchAll(Array.flatten(recorded))
    return recorded.length
  })

const processDelegationBatch = (
  delegations: ReadonlyArray<{ readonly id: string }>,
  transition: Transition
) =>
  Effect.gen(function* () {
    if (Array.isReadonlyArrayEmpty(delegations)) return 0
    const succeeded = yield* transitionTogether(delegations, transition).pipe(
      Effect.catchTag('SqlError', (error) =>
        Effect.logWarning(
          '[delegation-scheduler] Batch failed, retrying each delegation alone',
          { error: String(error) }
        ).pipe(
          Effect.andThen(
            Effect.forEach(delegations, (d) =>
              transitionTogether([d], transition).pipe(
                Effect.catchTag('SqlError', (e) =>
                  Effect.logWarning(
                    '[delegation-scheduler] Failed to process delegation',
                    { delegationId: d.id, error: String(e) }
                  ).pipe(Effect.as(0))
                )
              )
            )
          ),
          Effect.map(Array.reduce(0, (acc, n) => acc + n))
        )
      )
    )
    if (succeeded < delegations.length) {
      yield* Effect.logWarning(
        `[delegation-scheduler] Processed ${succeeded}/${delegations.length} delegations`
      )
    }
    return succeeded
  })

export const pollAndTransition = Effect.gen(function* () {
  const delegationRepo = yield* DelegationRepository
  const now = nowAsDate()

  const toActivate = yield* delegationRepo.findAcceptedReadyToActivate(now)
  const activated = yield* processDelegationBatch(toActivate, {
    from: 'accepted',
    to: 'active',
    notificationType: 'delegation_activated',
    timestamps: undefined,
  })

  if (activated > 0) {
    yield* Effect.log(`Activated ${activated} delegations`)
  }

  const toComplete = yield* delegationRepo.findActiveReadyToComplete(now)
  const completed = yield* processDelegationBatch(toComplete, {
    from: 'active',
    to: 'completed',
    notificationType: 'delegation_completed',
    timestamps: { completedAt: now },
  })

  if (completed > 0) {
    yield* Effect.log(`Completed ${completed} delegations`)
  }
}).pipe(Effect.withSpan('DelegationScheduler.pollAndTransition'))

export const startDelegationScheduler = createScheduler({
  name: 'delegation-scheduler',
  interval: '5 minutes',
  runOnStartup: false,
  task: pollAndTransition,
})
