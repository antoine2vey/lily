import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { UserProfile } from '@lily/shared/auth'
import { Context, Effect, Option } from 'effect'

export interface SessionContext {
  readonly userId: string
  readonly user: UserProfile
}

export class Session extends Context.Service<Session, SessionContext>()(
  'Session'
) {}

export const withSession = <A, E, R>(
  effect: Effect.Effect<A, E, R | Session>
): Effect.Effect<A, E, Exclude<R, Session> | CurrentUser> =>
  Effect.gen(function* () {
    const user = yield* CurrentUser

    const userProfile: UserProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      timezone: Option.getOrUndefined(Option.fromNullishOr(user.timezone)),
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
