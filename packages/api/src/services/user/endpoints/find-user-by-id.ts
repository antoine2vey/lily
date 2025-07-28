import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

export const findUserById = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Database

    const user = yield* Effect.tryPromise({
      try: () =>
        db.client.user.findUnique({
          where: { id },
        }),
      catch: () => new DatabaseError(),
    })

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return user
  })
