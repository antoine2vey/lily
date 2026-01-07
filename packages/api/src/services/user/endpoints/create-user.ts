import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import type { User } from '@lily/shared/user'
import { Effect } from 'effect'

export const createUser = (
  name: string,
  email: string
): Effect.Effect<User, SqlError | DatabaseError, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const [user] = yield* db
      .insert(users)
      .values({ name, email, emailVerified: false })
      .returning()

    if (!user) {
      return yield* Effect.fail(new DatabaseError())
    }

    return user
  })
