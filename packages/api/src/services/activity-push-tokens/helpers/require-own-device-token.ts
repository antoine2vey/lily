import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { DeviceTokenNotFoundError } from '@lily/shared'
import { Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// The activity-token upserts key on device_token_id and overwrite userId, so
// the caller must own the device. A device that changed hands is already
// reassigned by registerDeviceToken before the app registers these tokens.
export const requireOwnDeviceToken = (
  deviceTokenId: string
): Effect.Effect<
  void,
  DeviceTokenNotFoundError | SqlError,
  DeviceTokenRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* DeviceTokenRepository
    const { id: userId } = yield* CurrentUser
    const device = yield* repo.findById(deviceTokenId)

    if (
      !Option.exists(Option.fromNullishOr(device), (d) => d.userId === userId)
    ) {
      return yield* new DeviceTokenNotFoundError()
    }
  })
