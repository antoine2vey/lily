import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  Multipart,
} from '@effect/platform'
import {
  Authentication,
  Unauthorized,
} from '@lily/api/services/auth/middleware.types'
import { DatabaseError } from '@lily/shared/errors/database'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { UserSettings, UserSettingsUpdateRequest } from '@lily/shared/user'
import { Schema } from 'effect'

// Define the Users API group
export const UsersApi = HttpApiGroup.make('users')
  .add(
    // GET /users/settings - Fetch profile info & notification prefs (uses CurrentUser)
    HttpApiEndpoint.get('getUserSettings')`/settings`
      .addSuccess(UserSettings)
      .addError(DatabaseError, { status: 500 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(Unauthorized, { status: 401 })
  )
  .add(
    // PUT /users/settings - Update profile & global notification settings (uses CurrentUser)
    HttpApiEndpoint.put('updateUserSettings')`/settings`
      .setPayload(UserSettingsUpdateRequest)
      .addSuccess(UserSettings)
      .addError(DatabaseError, { status: 500 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(Unauthorized, { status: 401 })
  )
  .add(
    // POST /users/avatar - Upload user avatar (uses CurrentUser)
    HttpApiEndpoint.post('uploadAvatar')`/avatar`
      .setPayload(
        HttpApiSchema.Multipart(
          Schema.Struct({
            files: Multipart.FilesSchema,
          })
        )
      )
      .addSuccess(Schema.Struct({ url: Schema.String }))
      .addError(DatabaseError, { status: 500 })
      .addError(UserNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Unauthorized, { status: 401 })
  )
  .prefix('/users')
  .middleware(Authentication)
