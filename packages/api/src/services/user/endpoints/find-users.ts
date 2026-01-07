import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { users } from '@lily/db'
import type { User } from '@lily/shared'
import { Effect } from 'effect'

// User service methods
export const findUsers = (): Effect.Effect<
  User[],
  SqlError,
  PgDrizzle.PgDrizzle
> =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    return yield* db.select().from(users)
  })
