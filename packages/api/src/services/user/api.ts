import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  Multipart,
} from '@effect/platform'
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

// Define the Users API group
export const UsersApi = HttpApiGroup.make('users')
  .add(
    // GET /users/settings - Fetch profile info & notification prefs (uses CurrentUser)
    HttpApiEndpoint.get('getUserSettings')`/settings`
      .addSuccess(UserSettings)
      .addError(UserNotFoundError, { status: 404 })
      .addError(UnauthorizedError, { status: 401 })
  )
  .add(
    // PUT /users/settings - Update profile & global notification settings (uses CurrentUser)
    HttpApiEndpoint.put('updateUserSettings')`/settings`
      .setPayload(UserSettingsUpdateRequest)
      .addSuccess(UserSettings)
      .addError(UserNotFoundError, { status: 404 })
      .addError(UnauthorizedError, { status: 401 })
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
      .addError(UserNotFoundError, { status: 404 })
      .addError(MultipleFilesError, { status: 400 })
      .addError(NoFilesError, { status: 400 })
      .addError(GCSUploadError, { status: 500 })
      .addError(GCSConfigError, { status: 500 })
      .addError(UnauthorizedError, { status: 401 })
  )
  .prefix('/users')
  .middleware(Authentication)
