import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { deleteAccount } from '@lily/api/services/user/endpoints/delete-account'
import { getUserSettings } from '@lily/api/services/user/endpoints/get-user-settings'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import { uploadAvatar } from '@lily/api/services/user/endpoints/upload-avatar'

export const UsersApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'users', (handlers) =>
    handlers
      .handle('getUserSettings', () =>
        getUserSettings().pipe(withInfraErrorsAsDefect)
      )
      .handle('updateUserSettings', ({ payload }) =>
        updateUserSettings(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('uploadAvatar', ({ payload: { files } }) =>
        uploadAvatar(files).pipe(withInfraErrorsAsDefect)
      )
      .handle('deleteAccount', () =>
        deleteAccount().pipe(withInfraErrorsAsDefect)
      )
  )
