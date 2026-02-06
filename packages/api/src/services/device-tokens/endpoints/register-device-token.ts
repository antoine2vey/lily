import type { SqlError } from '@effect/sql/SqlError'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type {
  DeviceToken,
  DeviceTokenCreateRequest,
} from '@lily/shared/device-token'
import { Effect } from 'effect'

// Register or update device token
export const registerDeviceToken = (
  request: DeviceTokenCreateRequest
): Effect.Effect<DeviceToken, SqlError, DeviceTokenRepository | CurrentUser> =>
  Effect.gen(function* () {
    const repo = yield* DeviceTokenRepository
    const { id: userId } = yield* CurrentUser

    // Check if token already exists for this user
    const existing = yield* repo.findByTokenAndUserId(request.token, userId)

    if (existing) {
      // Update existing token to mark as active
      const updated = yield* repo.update(existing.id, { isActive: true })
      return updated as DeviceToken
    }

    // Create new device token
    const created = yield* repo.create({
      token: request.token,
      platform: request.platform,
      userId,
    })

    return created as DeviceToken
  }).pipe(Effect.withSpan('DeviceTokensService.registerDeviceToken'))
