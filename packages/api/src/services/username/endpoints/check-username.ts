import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import {
  type UsernameAvailability,
  usernameProblem,
} from '@lily/shared/username'
import { Effect, Option, String } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// Check username availability
export const checkUsername = (
  username: string
): Effect.Effect<
  UsernameAvailability,
  SqlError | RateLimitExceededError,
  UserRepository | RateLimiterService | CurrentUser
> =>
  Effect.gen(function* () {
    const { id: userId } = yield* CurrentUser
    const rateLimiter = yield* RateLimiterService
    yield* rateLimiter.checkRateLimit(
      `username-check:${userId}`,
      RATE_LIMITS.USERNAME_CHECK
    )

    if (Option.isSome(usernameProblem(String.trim(username)))) {
      return { username, available: false }
    }

    const repo = yield* UserRepository
    const user = yield* repo.findByUsername(String.trim(username))

    return {
      username,
      available: user === null,
    }
  }).pipe(
    Effect.withSpan('UsernameService.checkUsername', {
      attributes: { 'username.value': username },
    })
  )
