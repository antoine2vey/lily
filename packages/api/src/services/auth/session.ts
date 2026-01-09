import type { HttpServerRequest } from '@effect/platform'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Auth } from '@lily/api/services/auth/auth'
import type { UserProfile } from '@lily/shared/auth'
import { SessionNotFoundError } from '@lily/shared/errors/user'
import { Context, Effect } from 'effect'

export interface SessionContext {
  readonly userId: string
  readonly user: UserProfile
}

export class Session extends Context.Tag('Session')<
  Session,
  SessionContext
>() {}

/**
 * Wraps an effect to provide Session context from the current HTTP request.
 * Use this in handlers to inject the authenticated user's session.
 *
 * @example
 * .handle('createPlant', ({ payload }) =>
 *   withSession(plantsService.createPlant(payload))
 * )
 */
export const withSession = <A, E, R>(
  effect: Effect.Effect<A, E, R | Session>
): Effect.Effect<
  A,
  E | SessionNotFoundError,
  | Exclude<R, Session>
  | Auth
  | HttpServerRequest.HttpServerRequest
  | UserRepository
> =>
  Effect.gen(function* () {
    const auth = yield* Auth
    const session = yield* auth.session

    if (!session) {
      return yield* Effect.fail(new SessionNotFoundError())
    }

    // Fetch full user from database to get role and status
    const userRepo = yield* UserRepository
    const user = yield* Effect.catchAll(
      userRepo.findById(session.user.id),
      () => Effect.fail(new SessionNotFoundError({ message: 'User not found' }))
    )

    if (!user) {
      return yield* Effect.fail(
        new SessionNotFoundError({ message: 'User not found' })
      )
    }

    const userProfile: UserProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role,
      status: user.status,
    }

    return yield* effect.pipe(
      Effect.provideService(Session, {
        userId: user.id,
        user: userProfile,
      })
    )
  })
