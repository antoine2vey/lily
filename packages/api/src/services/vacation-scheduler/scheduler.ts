import { UserRepository } from '@lily/api/repositories/user.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { activateVacation } from '@lily/api/services/vacation/helpers/activate-vacation'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import { nowAsDate } from '@lily/shared'
import { Effect, Number, Option, pipe } from 'effect'

const transitionUser = <R>(
  transition: Effect.Effect<unknown, unknown, R>,
  userId: string
): Effect.Effect<number, never, R> =>
  transition.pipe(
    Effect.flatMap((claimed) =>
      Option.match(Option.fromNullishOr(claimed), {
        onNone: () =>
          Effect.log('[vacation-scheduler] Skipped user: vacation changed', {
            userId,
          }).pipe(Effect.as(0)),
        onSome: () => Effect.succeed(1),
      })
    ),
    Effect.catch((e) =>
      Effect.logWarning('[vacation-scheduler] Failed to process user', {
        userId,
        error: String(e),
      }).pipe(Effect.as(0))
    )
  )

/**
 * Poll for vacation transitions (mirrors the delegation scheduler):
 * - 'scheduled' users whose start has passed are activated (pending
 *   care/engagement notifications deleted, status flipped).
 * - 'active' users whose end has passed get the end-routine (schedule
 *   shift + reminder rebuild + state reset). The stored vacationEnd — not
 *   `now` — is used as effectiveEnd so the shift delta stays correct even
 *   if the server was down across the boundary.
 *
 * Endpoints share the same helpers, so manual and scheduled transitions
 * behave identically. runOnStartup + status-driven queries give restart
 * catch-up for free.
 */
export const pollAndTransitionVacations = Effect.gen(function* () {
  const userRepo = yield* UserRepository
  const now = nowAsDate()

  const toActivate = yield* userRepo.findVacationsToActivate(now)
  const activated = yield* Effect.forEach(toActivate, (user) =>
    transitionUser(activateVacation({ expected: user }), user.id)
  )
  const activatedCount = Number.sumAll(activated)
  if (activatedCount > 0) {
    yield* Effect.log(`Activated ${activatedCount} vacations`)
  }

  const toEnd = yield* userRepo.findVacationsToEnd(now)
  const ended = yield* Effect.forEach(toEnd, (user) =>
    transitionUser(
      endVacation({
        user,
        effectiveEnd: pipe(
          Option.fromNullishOr(user.vacationEnd),
          Option.getOrElse(() => now)
        ),
      }),
      user.id
    )
  )
  const endedCount = Number.sumAll(ended)
  if (endedCount > 0) {
    yield* Effect.log(`Ended ${endedCount} vacations`)
  }
}).pipe(Effect.withSpan('VacationScheduler.pollAndTransition'))

export const startVacationScheduler = createScheduler({
  name: 'vacation-scheduler',
  interval: '5 minutes',
  runOnStartup: true,
  task: pollAndTransitionVacations,
})
