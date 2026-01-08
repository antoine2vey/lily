import type { SqlError } from '@effect/sql/SqlError'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { Session } from '@lily/api/services/auth/session'
import { DeviceTokenNotFoundError } from '@lily/shared'
import { Effect } from 'effect'

// Unregister device token
export const unregisterDeviceToken = (
  tokenId: string
): Effect.Effect<
  { message: string },
  SqlError | DeviceTokenNotFoundError,
  DeviceTokenRepository | Session
> =>
  Effect.gen(function* () {
    const repo = yield* DeviceTokenRepository
    const { userId } = yield* Session

    // Find the token and verify ownership
    const token = yield* repo.findById(tokenId)

    if (!token || token.userId !== userId) {
      return yield* Effect.fail(new DeviceTokenNotFoundError())
    }

    // Delete the token
    yield* repo.delete(tokenId)

    return { message: 'Device token unregistered successfully' }
  })
