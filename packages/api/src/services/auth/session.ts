import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { UserProfile } from '@lily/shared/auth'
import { Context, Effect, Option } from 'effect'

export interface SessionContext {
  readonly userId: string
  readonly user: UserProfile
}

export class Session extends Context.Tag('Session')<
  Session,
  SessionContext
>() {}

/**
 * Wraps an effect to provide Session context from the current authenticated user.
 * Use this in handlers to inject the authenticated user's session.
 *
 * @example
 * .handle('createPlant', ({ payload }) =>
 *   withSession(plantsService.createPlant(payload))
 * )
 */
export const withSession = <A, E, R>(
  effect: Effect.Effect<A, E, R | Session>
): Effect.Effect<A, E, Exclude<R, Session> | CurrentUser> =>
  Effect.gen(function* () {
    // CurrentUser is provided by the auth middleware
    const user = yield* CurrentUser

    const userProfile: UserProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      timezone: Option.getOrUndefined(Option.fromNullable(user.timezone)),
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
