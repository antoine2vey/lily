import { Effect } from 'effect'
import { registerDeviceToken } from './endpoints/register-device-token'
import { unregisterDeviceToken } from './endpoints/unregister-device-token'

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
