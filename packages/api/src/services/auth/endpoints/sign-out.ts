import { HttpServerRequest } from '@effect/platform'
import { auth } from '@lily/api/services/auth/auth'
import { Effect } from 'effect'

export const signOut = (): Effect.Effect<
  { message: string },
  Error,
  HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest

    yield* Effect.tryPromise({
      try: () =>
        auth.api.signOut({
          headers: new Headers(req.headers),
        }),
      catch: () => new Error('Failed to sign out'),
    })

    return { message: 'Successfully signed out' }
  })
