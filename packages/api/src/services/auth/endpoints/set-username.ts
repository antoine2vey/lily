import type { HttpServerRequest } from '@effect/platform'
import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db'
import { Auth } from '@lily/db/lib/auth'
import type { UsernameRequest, UserProfile } from '@lily/shared/auth'
import {
  SessionNotFoundError,
  UserNotFoundError,
} from '@lily/shared/errors/user'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

// Set username
export const setUsername = (
  request: UsernameRequest
): Effect.Effect<
  UserProfile,
  SqlError | SessionNotFoundError | UserNotFoundError,
  PgDrizzle.PgDrizzle | Auth | HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const auth = yield* Auth
    const session = yield* auth.session

    if (!session) {
      return yield* Effect.fail(
        new SessionNotFoundError({
          message: 'No session found',
        })
      )
    }

    const [user] = yield* db
      .update(users)
      .set({
        name: request.username,
      })
      .where(eq(users.id, session.user.id))
      .returning()

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return user
  })
