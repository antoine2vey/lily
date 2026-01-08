import { createUser } from '@lily/api/services/user/endpoints/create-user'
import { deleteUser } from '@lily/api/services/user/endpoints/delete-user'
import { findUserById } from '@lily/api/services/user/endpoints/find-user-by-id'
import { findUsers } from '@lily/api/services/user/endpoints/find-users'
import { getUserSettings } from '@lily/api/services/user/endpoints/get-user-settings'
import { updateUser } from '@lily/api/services/user/endpoints/update-user'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { Effect } from 'effect'

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
