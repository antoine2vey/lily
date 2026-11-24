import { UserRepository } from '@lily/api/repositories/user.repository'
import { startCards } from '@lily/api/services/live-activity/cards'
import type { AdminLiveActivityTriggerResponse } from '@lily/shared/admin'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Array, Effect, Match } from 'effect'

type Outcome = AdminLiveActivityTriggerResponse['outcomes'][number]

// Diagnostic: push the user's cards now, past the start cooldown, and return
// each push's APNs outcome so an operator can tell whether the issue is at
// the server (config, send error) or downstream on the device.
export const triggerLiveActivityStart = (userId: string) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const user = yield* userRepo.findById(userId)
    if (!user) return yield* new UserNotFoundError()

    const sync = yield* startCards(userId, {
      alert: (state) => ({
        title: state.title,
        body: state.headline,
        sound: 'default',
      }),
      bypassCooldown: true,
    })
    const outcomes = Array.map(
      sync.pushes,
      ({ push, deviceTokenId, outcome }) =>
        Match.value(outcome).pipe(
          Match.when(
            { kind: 'accepted' },
            ({ kind, apnsId }): Outcome => ({
              deviceTokenId,
              push,
              kind,
              apnsId,
            })
          ),
          Match.orElse(
            ({ kind, reason }): Outcome => ({
              deviceTokenId,
              push,
              kind,
              reason,
            })
          )
        )
    )

    yield* Effect.logInfo('[admin] LA trigger-start completed', {
      userId,
      activityId: sync.activityId,
      outcomes,
    })

    return {
      userId,
      activityId: sync.activityId,
      contentStateBuilt: sync.due,
      startTokenCount: sync.startTokenCount,
      outcomes,
    } satisfies AdminLiveActivityTriggerResponse
  }).pipe(
    Effect.withSpan('AdminService.triggerLiveActivityStart', {
      attributes: { 'user.id': userId },
    })
  )
