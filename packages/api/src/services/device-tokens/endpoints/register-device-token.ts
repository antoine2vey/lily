import { Database } from '@lily/db'
import type {
  DeviceToken,
  DeviceTokenCreateRequest,
} from '@lily/shared/device-token'
import { Effect } from 'effect'

// Register device token
export const registerDeviceToken = (request: DeviceTokenCreateRequest) =>
  Effect.gen(function* () {
    const _db = yield* Database

    // Return fake device token
    return {
      id: 'token_123',
      token: request.token,
      platform: request.platform,
      isActive: true,
      userId: 'user_123',
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies DeviceToken
  })
