import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { DeviceTokenRepositoryLive } from '@lily/api/repositories/device-token.repository'
import { Auth } from '@lily/api/services/auth/auth'
import { withSession } from '@lily/api/services/auth/session'
import { DeviceTokensService } from '@lily/api/services/device-tokens/service'
import { Effect, Layer } from 'effect'

// Implement the Device Tokens API group
export const DeviceTokensApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'deviceTokens', (handlers) =>
    Effect.gen(function* () {
      const deviceTokensService = yield* DeviceTokensService

      return handlers
        .handle('registerDeviceToken', ({ payload }) =>
          withSession(deviceTokensService.registerDeviceToken(payload))
        )
        .handle('unregisterDeviceToken', ({ path: { tokenId } }) =>
          withSession(deviceTokensService.unregisterDeviceToken(tokenId))
        )
    })
  ).pipe(
    Layer.provide(DeviceTokensService.Default),
    Layer.provide(DeviceTokenRepositoryLive),
    Layer.provide(Auth.Default)
  )
