import {
  HttpApiMiddleware,
  HttpApiSecurity,
  HttpServerRequest,
} from '@effect/platform'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { Auth } from '@lily/api/services/auth/auth'
import { Unauthorized } from '@lily/api/services/auth/middleware'
import type { UserProfile } from '@lily/shared/auth'
import { ForbiddenError } from '@lily/shared/errors/admin'
import { Context, Effect, Layer, Redacted } from 'effect'

/**
 * Admin user context - CurrentUser with verified admin role
 */
export class AdminUser extends Context.Tag('AdminUser')<
  AdminUser,
  UserProfile
>() {}

/**
 * Admin authorization middleware
 * Validates bearer token AND verifies admin role
 */
export class AdminAuth extends HttpApiMiddleware.Tag<AdminAuth>()('AdminAuth', {
  failure: ForbiddenError,
  provides: AdminUser,
  security: {
    bearer: HttpApiSecurity.bearer,
  },
}) {}

/**
 * Base layer for AdminAuth middleware
 * Validates bearer token and checks admin role in one step
 */
const AdminAuthBase = Layer.effect(
  AdminAuth,
  Effect.gen(function* () {
    const authService = yield* Auth
    const authClient = yield* authService.client
    const userRepo = yield* UserRepository

    return AdminAuth.of({
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
            catch: () => new ForbiddenError({ message: 'Invalid token' }),
          })

          if (!session?.user) {
            return yield* Effect.fail(
              new ForbiddenError({ message: 'Invalid or expired token' })
            )
          }

          // Fetch full user with role and status from database
          const user = yield* Effect.catchAll(
            userRepo.findById(session.user.id),
            () => Effect.fail(new ForbiddenError({ message: 'User not found' }))
          )

          if (!user) {
            return yield* Effect.fail(
              new ForbiddenError({ message: 'User not found' })
            )
          }

          // Check if user is active
          if (user.status !== 'active') {
            return yield* Effect.fail(
              new ForbiddenError({
                message: `Account is ${user.status}`,
              })
            )
          }

          // Verify admin role
          if (user.role !== 'admin') {
            return yield* Effect.fail(
              new ForbiddenError({ message: 'Admin access required' })
            )
          }

          // Return user profile for AdminUser context
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.name,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            role: user.role,
            status: user.status,
          } as UserProfile
        }),
    })
  })
)

/**
 * AdminAuth middleware with all dependencies bundled
 * Use this in handler files
 */
export const AdminAuthLive = AdminAuthBase.pipe(
  Layer.provide(Auth.Default),
  Layer.provide(UserRepositoryLive)
)
