import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db'
import type { User } from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

export const findUserById = (
  id: string
): Effect.Effect<User, SqlError | UserNotFoundError, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const [user] = yield* db.select().from(users).where(eq(users.id, id))

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return user
  })
