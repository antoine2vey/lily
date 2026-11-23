import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  DeviceToken,
  DeviceTokenCreateRequest,
  DeviceTokenNotFoundError,
} from '@lily/shared/device-token'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const tokenIdParam = Schema.String.check(Schema.isGUID())

export const DeviceTokensApi = HttpApiGroup.make('deviceTokens')
  .add(
    HttpApiEndpoint.post('registerDeviceToken', '/', {
      payload: DeviceTokenCreateRequest,
      success: DeviceToken.pipe(HttpApiSchema.status(201)),
      error: [
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(400)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete('unregisterDeviceToken', '/:tokenId', {
      params: { tokenId: tokenIdParam },
      success: Schema.Struct({ message: Schema.String }),
      error: [
        DeviceTokenNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .prefix('/device-tokens')
  .middleware(Authentication)
