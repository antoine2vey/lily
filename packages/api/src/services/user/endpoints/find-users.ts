import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import { Effect } from 'effect'

// User service methods
export const findUsers = Effect.gen(function* (_) {
  const db = yield* Database
  return yield* Effect.tryPromise({
    try: () => db.client.user.findMany(),
    catch: () => new DatabaseError(),
  })
})
