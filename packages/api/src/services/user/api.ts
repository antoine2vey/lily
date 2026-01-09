import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication, Unauthorized } from '@lily/api/services/auth/middleware'
import { DatabaseError } from '@lily/shared/errors/database'
import { UserNotFoundError } from '@lily/shared/errors/user'
import {
  UserSettings,
  UserSettingsUpdateRequest,
} from '@lily/shared/user'
import { Schema } from 'effect'

// Path parameter for user ID
const userIdParam = HttpApiSchema.param('id', Schema.String)

// Define the Users API group
export const UsersApi = HttpApiGroup.make('users')
  .add(
    // GET /users/:userId/settings - Fetch profile info & notification prefs
    HttpApiEndpoint.get('getUserSettings')`/${userIdParam}/settings`
      .addSuccess(UserSettings)
      .addError(DatabaseError, { status: 500 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(Unauthorized, { status: 401 })
  )
  .add(
    // PUT /users/:userId/settings - Update profile & global notification settings
    HttpApiEndpoint.put('updateUserSettings')`/${userIdParam}/settings`
      .setPayload(UserSettingsUpdateRequest)
      .addSuccess(UserSettings)
      .addError(DatabaseError, { status: 500 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(Unauthorized, { status: 401 })
  )
  .prefix('/users')
  .middleware(Authentication)
