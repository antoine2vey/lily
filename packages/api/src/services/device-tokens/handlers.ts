import type { Api } from '@lily/api/api'
import { registerDeviceToken } from '@lily/api/services/device-tokens/endpoints/register-device-token'
import { unregisterDeviceToken } from '@lily/api/services/device-tokens/endpoints/unregister-device-token'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { HttpApiBuilder } from 'effect/http-api'

export const DeviceTokensApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'deviceTokens', (handlers) =>
    handlers
      .handle('registerDeviceToken', ({ payload }) =>
        registerDeviceToken(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('unregisterDeviceToken', ({ params: { tokenId } }) =>
        unregisterDeviceToken(tokenId).pipe(withInfraErrorsAsDefect)
      )
  )
