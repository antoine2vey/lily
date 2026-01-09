import {
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  HttpServerRequest,
} from '@effect/platform'
import { Auth } from '@lily/api/services/auth/auth'
import type { UserProfile } from '@lily/shared/auth'
import { Context, Effect, Layer, Redacted, Schema } from 'effect'

/**
 * Current authenticated user context provided by auth middleware
 */
export class CurrentUser extends Context.Tag('CurrentUser')<
  CurrentUser,
  UserProfile
>() {}

/**
 * Unauthorized error returned when authentication fails
 */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Unauthorized',
    }),
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

/**
 * Authentication middleware using Bearer token
 * Validates JWT token and provides CurrentUser context to handlers
 */
export class Authentication extends HttpApiMiddleware.Tag<Authentication>()(
  'Authentication',
  {
    failure: Unauthorized,
    provides: CurrentUser,
    security: {
      bearer: HttpApiSecurity.bearer,
    },
  }
) {}

/**
 * Live implementation of Authentication middleware
 * Validates bearer token using better-auth session
 */
export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const authService = yield* Auth
    const authClient = yield* authService.client

    return Authentication.of({
      bearer: (token) =>
        Effect.gen(function* () {
          const req = yield* HttpServerRequest.HttpServerRequest

          // Create headers with the bearer token for better-auth
          const headers = new Headers(req.headers)
          headers.set('Authorization', `Bearer ${Redacted.value(token)}`)

          // Validate session with better-auth
          const session = yield* Effect.tryPromise({
            try: () =>
              authClient.api.getSession({
                headers,
                query: { disableCookieCache: true },
              }),
            catch: () => new Unauthorized({ message: 'Invalid token' }),
          })

          if (!session?.user) {
            return yield* Effect.fail(
              new Unauthorized({ message: 'Invalid or expired token' })
            )
          }

          // Return user profile for CurrentUser context
          // Note: 'name' field is used as the username in this app
          return {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            username: session.user.name,
            createdAt: session.user.createdAt,
            updatedAt: session.user.updatedAt,
          } as UserProfile
        }),
    })
  })
).pipe(Layer.provide(Auth.Default))
