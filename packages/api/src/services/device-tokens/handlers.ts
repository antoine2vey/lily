import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { registerDeviceToken } from '@lily/api/services/device-tokens/endpoints/register-device-token'
import { unregisterDeviceToken } from '@lily/api/services/device-tokens/endpoints/unregister-device-token'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'

export const DeviceTokensApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'deviceTokens', (handlers) =>
    handlers
      .handle('registerDeviceToken', ({ payload }) =>
        registerDeviceToken(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('unregisterDeviceToken', ({ path: { tokenId } }) =>
        unregisterDeviceToken(tokenId).pipe(withInfraErrorsAsDefect)
      )
  )
