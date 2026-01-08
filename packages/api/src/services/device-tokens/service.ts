import { registerDeviceToken } from '@lily/api/services/device-tokens/endpoints/register-device-token'
import { unregisterDeviceToken } from '@lily/api/services/device-tokens/endpoints/unregister-device-token'
import { Effect } from 'effect'

// Device Tokens service implementation
export class DeviceTokensService extends Effect.Service<DeviceTokensService>()(
  'DeviceTokensService',
  {
    effect: Effect.succeed({
      registerDeviceToken,
      unregisterDeviceToken,
    }),
  }
) {}
