// handlers.ts
import { Database } from '@lily/api/services/database/service.js'
import { UserRpcs } from '@lily/api/services/user/requests'
import { UserService } from '@lily/api/services/user/service.js'
import { Effect, Layer } from 'effect'

export const UsersLive = UserRpcs.toLayer(
  Effect.gen(function* () {
    const userService = yield* UserService

    return {
      UserList: () => userService.findUsers,
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
