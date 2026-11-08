import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import type { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { requireOwnDeviceToken } from '@lily/api/services/activity-push-tokens/helpers/require-own-device-token'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type {
  ActivityPushToken,
  DeviceTokenNotFoundError,
  RegisterStartTokenRequest,
} from '@lily/shared'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// Idempotent upsert — Apple rotates push-to-start tokens per device.
export const registerStartToken = (
  request: RegisterStartTokenRequest
): Effect.Effect<
  ActivityPushToken,
  DeviceTokenNotFoundError | SqlError,
  ActivityPushTokenRepository | DeviceTokenRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* ActivityPushTokenRepository
    const { id: userId } = yield* CurrentUser
    yield* requireOwnDeviceToken(request.deviceTokenId)

    const upserted = yield* repo.upsertStartToken({
      userId,
      deviceTokenId: request.deviceTokenId,
      token: request.startToken,
    })

    // Drop orphan start-rows tied to dead device_tokens for this user — the
    // device_token's `is_active = false` predicate keeps multi-device users
    // safe.
    yield* repo.endOrphanStartTokens(userId, request.deviceTokenId)

    return upserted
  }).pipe(Effect.withSpan('ActivityPushTokensService.registerStartToken'))
