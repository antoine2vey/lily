import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { UserProfile } from '@lily/shared/auth'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { Effect, Option, pipe } from 'effect'

/**
 * Resolves a full UserProfile from the OAuth AuthInfo attached to each request.
 *
 * The OAuth access token carries a userId (set during the authorize flow).
 * This function loads the full user record from the database and builds the
 * UserProfile object expected by CurrentUser — the same shape the API uses.
 */
export const resolveCurrentUser = (
  authInfo: AuthInfo & { userId?: string }
): Effect.Effect<UserProfile, SqlError | Error, UserRepository> =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const userId = pipe(
      Option.fromNullable(authInfo.userId),
      Option.getOrElse(() => '')
    )

    if (!userId) {
      return yield* Effect.fail(new Error('No userId in auth token'))
    }

    const user = yield* userRepo.findById(userId)
    if (!user) {
      return yield* Effect.fail(new Error('User not found'))
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.name ?? undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role,
      status: user.status,
    } satisfies UserProfile
  }).pipe(Effect.withSpan('MCP.resolveCurrentUser'))
