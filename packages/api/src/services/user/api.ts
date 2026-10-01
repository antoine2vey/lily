import { Authentication } from '@lily/api/services/auth/middleware.types'
import { UnauthorizedError, UserNotFoundError } from '@lily/shared'
import {
  MultipleFilesError,
  NoFilesError,
} from '@lily/shared/services/file/fileservice'
import {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import { UserSettings, UserSettingsUpdateRequest } from '@lily/shared/user'
import { Schema } from 'effect'
import { Multipart } from 'effect/http'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// Define the Users API group
export const UsersApi = HttpApiGroup.make('users')
  .add(
    // GET /users/settings - Fetch profile info & notification prefs (uses CurrentUser)
    HttpApiEndpoint.get('getUserSettings', '/settings', {
      success: UserSettings,
      error: [UserNotFoundError, UnauthorizedError],
    })
  )
  .add(
    // PUT /users/settings - Update profile & global notification settings (uses CurrentUser)
    HttpApiEndpoint.put('updateUserSettings', '/settings', {
      payload: UserSettingsUpdateRequest,
      success: UserSettings,
      error: [UserNotFoundError, UnauthorizedError],
    })
  )
  .add(
    // POST /users/avatar - Upload user avatar (uses CurrentUser)
    HttpApiEndpoint.post('uploadAvatar', '/avatar', {
      payload: Schema.Struct({
        files: Multipart.FilesSchema,
      }).pipe(HttpApiSchema.asMultipart()),
      success: Schema.Struct({ url: Schema.String }),
      error: [
        UserNotFoundError,
        MultipleFilesError.pipe(HttpApiSchema.status(400)),
        NoFilesError.pipe(HttpApiSchema.status(400)),
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        UnauthorizedError,
      ],
    })
  )
  .add(
    // DELETE /users/account - Soft-delete account (30-day grace period)
    HttpApiEndpoint.delete('deleteAccount', '/account', {
      success: Schema.Struct({ message: Schema.String }),
      error: [UserNotFoundError, UnauthorizedError],
    })
  )
  .prefix('/users')
  .middleware(Authentication)
