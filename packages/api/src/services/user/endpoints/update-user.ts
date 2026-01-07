import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db'
import { UserNotFoundError } from '@lily/shared/errors/user'
import type { User } from '@lily/shared/user'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

export const updateUser = (
  id: string,
  data: { name?: string; email?: string }
): Effect.Effect<User, SqlError | UserNotFoundError, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const [user] = yield* db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning()

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return user
  })
