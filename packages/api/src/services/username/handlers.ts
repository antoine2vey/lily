import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { checkUsername } from '@lily/api/services/username/endpoints/check-username'

export const UsernameApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'username', (handlers) =>
    handlers.handle('checkUsername', ({ urlParams: { username } }) =>
      checkUsername(username).pipe(withInfraErrorsAsDefect)
    )
  )
