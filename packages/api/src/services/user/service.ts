import { Database } from '@lily/db'
import { DatabaseError } from '@lily/shared/errors/database'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { Effect } from 'effect'

// User service methods
const findUsers = Effect.gen(function* (_) {
  const db = yield* Database
  return yield* Effect.tryPromise({
    try: () => db.client.user.findMany(),
    catch: () => new DatabaseError(),
  })
})

const findUserById = (id: string) =>
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

const createUser = (name: string, email: string, appleId: string) =>
  Effect.gen(function* () {
    const db = yield* Database

    return yield* Effect.tryPromise({
      try: () =>
        db.client.user.create({
          data: { name, email, appleId },
        }),
      catch: () => new DatabaseError(),
    })
  })

const updateUser = (id: string, data: { name?: string; email?: string }) =>
  Effect.gen(function* () {
    const db = yield* Database

    const user = yield* Effect.tryPromise({
      try: () =>
        db.client.user.update({
          where: { id },
          data,
        }),
      catch: () => new DatabaseError(),
    })

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return user
  })

const deleteUser = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Database

    const user = yield* Effect.tryPromise({
      try: () =>
        db.client.user.delete({
          where: { id },
        }),
      catch: () => new DatabaseError(),
    })

    if (!user) {
      return yield* Effect.fail(new UserNotFoundError())
    }

    return user
  })

// User service implementation
export class UserService extends Effect.Service<UserService>()('UserService', {
  effect: Effect.succeed({
    findUsers,
    findUserById,
    createUser,
    updateUser,
    deleteUser,
  }),
}) {}
