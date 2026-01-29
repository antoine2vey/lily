import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  DeviceToken,
  DeviceTokenCreateRequest,
  DeviceTokenNotFoundError,
} from '@lily/shared/device-token'
import { Schema } from 'effect'

// Path parameter for token ID
const tokenIdParam = HttpApiSchema.param('tokenId', Schema.String)

// Define the Device Tokens API group
export const DeviceTokensApi = HttpApiGroup.make('deviceTokens')
  .add(
    // POST /device-tokens - Register/update a device token
    HttpApiEndpoint.post('registerDeviceToken')`/`
      .setPayload(DeviceTokenCreateRequest)
      .addSuccess(DeviceToken, { status: 201 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // DELETE /device-tokens/:tokenId - Unregister device token
    HttpApiEndpoint.del('unregisterDeviceToken')`/${tokenIdParam}`
      .addSuccess(Schema.Struct({ message: Schema.String }))
      .addError(DeviceTokenNotFoundError)
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/device-tokens')
  .middleware(Authentication)
