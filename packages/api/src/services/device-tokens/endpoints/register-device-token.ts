import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type {
  DeviceToken,
  DeviceTokenCreateRequest,
} from '@lily/shared/device-token'
import { Effect } from 'effect'

// Register device token
export const registerDeviceToken = (
  request: DeviceTokenCreateRequest
): Effect.Effect<DeviceToken, never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake device token
    return {
      id: 'token_123',
      token: request.token,
      platform: request.platform,
      isActive: true,
      userId: 'user_123',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })
