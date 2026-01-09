import { getUserSettings } from '@lily/api/services/user/endpoints/get-user-settings'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { Effect } from 'effect'

// User service implementation
export class UserService extends Effect.Service<UserService>()('UserService', {
  effect: Effect.succeed({
    getUserSettings,
    updateUserSettings,
  }),
}) {}
