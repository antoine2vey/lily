import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { DeviceTokensService } from '@lily/api/services/device-tokens/service'
import { Effect, Layer } from 'effect'

// Implement the Device Tokens API group
export const DeviceTokensApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'deviceTokens', (handlers) =>
    Effect.gen(function* () {
      const deviceTokensService = yield* DeviceTokensService

      return handlers
        .handle('registerDeviceToken', ({ payload }) =>
          deviceTokensService.registerDeviceToken(payload)
        )
        .handle('unregisterDeviceToken', ({ path: { tokenId } }) =>
          deviceTokensService.unregisterDeviceToken(tokenId)
        )
    })
  ).pipe(
    Layer.provide(DeviceTokensService.Default),
    Layer.provide(DeviceTokenRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
