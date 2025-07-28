import { Effect } from 'effect'
import { createUser } from './endpoints/create-user'
import { deleteUser } from './endpoints/delete-user'
import { findUserById } from './endpoints/find-user-by-id'
import { findUsers } from './endpoints/find-users'
import { getUserSettings } from './endpoints/get-user-settings'
import { updateUser } from './endpoints/update-user'
import { updateUserSettings } from './endpoints/update-user-settings'

// User service implementation
export class UserService extends Effect.Service<UserService>()('UserService', {
  effect: Effect.succeed({
    findUsers,
    findUserById,
    createUser,
    updateUser,
    deleteUser,
    getUserSettings,
    updateUserSettings,
  }),
}) {}
