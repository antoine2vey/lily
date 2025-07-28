import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import { Effect } from 'effect'

export const createUser = (name: string, email: string) =>
  Effect.gen(function* () {
    const db = yield* Database

    return yield* Effect.tryPromise({
      try: () =>
        db.client.user.create({
          data: { name, email, emailVerified: false },
        }),
      catch: () => new DatabaseError(),
    })
  })
