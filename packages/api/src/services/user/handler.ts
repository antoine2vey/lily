// handlers.ts

import { UserRpc } from '@lily/api/services/user/rpc'
import { UserService } from '@lily/api/services/user/service'
import { Database } from '@lily/db'
import { Effect, Layer, Stream } from 'effect'

export const UserServiceLive = UserRpc.toLayer(
  Effect.gen(function* () {
    const userService = yield* UserService

    return {
      UserList: () => Stream.fromIterableEffect(userService.findUsers),
      UserById: ({ id }) => userService.findUserById(id),
      UserCreate: ({ name, email, appleId }) =>
        userService.createUser(name, email, appleId),
      UserUpdate: ({ id, name, email }) =>
        userService.updateUser(id, { name, email }),
      UserDelete: ({ id }) => userService.deleteUser(id),
    }
  })
).pipe(
  // Provide the Database layer
  Layer.provide(Database.Default),
  Layer.provide(UserService.Default)
)
