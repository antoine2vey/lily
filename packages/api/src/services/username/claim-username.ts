import { UserRepository } from '@lily/api/repositories/user.repository'
import type { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { AuthError } from '@lily/shared'
import { usernameProblem } from '@lily/shared/username'
import { Effect, Option, String } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

/**
 * Validates a handle the user wants and returns it trimmed. Availability is
 * case-insensitive, so `Lily_Fan` is taken once `lily_fan` exists; changing
 * only the case of your own handle is allowed. Each real change counts
 * against a daily rename limit.
 */
export const claimUsername = (
  user: { readonly id: string; readonly name: string | null },
  requested: string
): Effect.Effect<
  string,
  AuthError | RateLimitExceededError | SqlError,
  UserRepository | RateLimiterService
> =>
  Effect.gen(function* () {
    const username = String.trim(requested)
    if (username === user.name) {
      return username
    }

    yield* Option.match(usernameProblem(username), {
      onNone: () => Effect.void,
      onSome: (message) => Effect.fail(new AuthError({ message })),
    })

    const userRepo = yield* UserRepository
    const rateLimiter = yield* RateLimiterService

    const owner = yield* userRepo.findByUsername(username)
    if (owner !== null && owner.id !== user.id) {
      return yield* new AuthError({ message: 'Username is already taken' })
    }

    yield* rateLimiter.checkRateLimit(
      `username-change:${user.id}`,
      RATE_LIMITS.USERNAME_CHANGE
    )
    return username
  })

/** A concurrent claim can still win the race to the unique index. */
export const usernameTakenOnConflict = <A, R>(
  self: Effect.Effect<A, SqlError, R>
): Effect.Effect<A, AuthError | SqlError, R> =>
  self.pipe(
    Effect.catchReason(
      'SqlError',
      'UniqueViolation',
      () => new AuthError({ message: 'Username is already taken' })
    )
  )
