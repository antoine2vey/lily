import { UserRepository } from '@lily/api/repositories/user.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { activateVacation } from '@lily/api/services/vacation/helpers/activate-vacation'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import { nowAsDate } from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

const withUserErrorIsolation = <A, R>(
  effect: Effect.Effect<A, unknown, R>,
  userId: string
) =>
  effect.pipe(
    Effect.catchAll((e) =>
      Effect.logWarning('[vacation-scheduler] Failed to process user', {
        userId,
        error: String(e),
      })
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
  yield* Effect.forEach(toActivate, (user) =>
    withUserErrorIsolation(activateVacation(user.id), user.id)
  )
  if (Array.isNonEmptyArray(toActivate)) {
    yield* Effect.log(`Activated ${toActivate.length} vacations`)
  }

  const toEnd = yield* userRepo.findVacationsToEnd(now)
  yield* Effect.forEach(toEnd, (user) =>
    withUserErrorIsolation(
      endVacation({
        userId: user.id,
        effectiveEnd: pipe(
          Option.fromNullable(user.vacationEnd),
          Option.getOrElse(() => now)
        ),
      }),
      user.id
    )
  )
  if (Array.isNonEmptyArray(toEnd)) {
    yield* Effect.log(`Ended ${toEnd.length} vacations`)
  }
}).pipe(Effect.withSpan('VacationScheduler.pollAndTransition'))

export const startVacationScheduler = createScheduler({
  name: 'vacation-scheduler',
  interval: '5 minutes',
  runOnStartup: true,
  task: pollAndTransitionVacations,
})
