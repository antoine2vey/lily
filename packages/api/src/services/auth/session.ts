import type { HttpServerRequest } from '@effect/platform'
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
  Exclude<R, Session> | Auth | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const auth = yield* Auth
    const session = yield* auth.session

    if (!session) {
      return yield* Effect.fail(new SessionNotFoundError())
    }

    return yield* effect.pipe(
      Effect.provideService(Session, {
        userId: session.user.id,
        user: session.user,
      })
    )
  })
