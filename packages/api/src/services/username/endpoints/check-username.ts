import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db'
import type { UsernameAvailability } from '@lily/shared/username'
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

// Check username availability
export const checkUsername = (
  username: string
): Effect.Effect<UsernameAvailability, SqlError, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const [user] = yield* db
      .select()
      .from(users)
      .where(eq(users.name, username))

    return {
      username,
      available: user === undefined,
    }
  })
