import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import type { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { requireOwnDeviceToken } from '@lily/api/services/activity-push-tokens/helpers/require-own-device-token'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type {
  ActivityPushToken,
  DeviceTokenNotFoundError,
  RegisterActivityTokenRequest,
} from '@lily/shared'
import { DateTime, Duration, Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// 10h soft ceiling — safely inside Apple's 12h hard cap. The safety
// scheduler sweeps expired activities on this boundary.
const ACTIVITY_TTL = Duration.hours(10)

export const registerActivityToken = (
  request: RegisterActivityTokenRequest
): Effect.Effect<
  ActivityPushToken,
  DeviceTokenNotFoundError | SqlError,
  ActivityPushTokenRepository | DeviceTokenRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* ActivityPushTokenRepository
    const { id: userId } = yield* CurrentUser
    yield* requireOwnDeviceToken(request.deviceTokenId)

    const endsAt = DateTime.toDateUtc(
      DateTime.addDuration(DateTime.nowUnsafe(), ACTIVITY_TTL)
    )

    const created = yield* repo.createActivity({
      userId,
      deviceTokenId: request.deviceTokenId,
      activityId: request.activityId,
      token: request.updateToken,
      endsAt,
    })

    // Receiving an update token proves the start-token for this device
    // actually delivered. Stamp it so the eviction sweep spares it.
    yield* repo.markStartTokenConfirmed(userId, request.deviceTokenId)

    return created
  }).pipe(Effect.withSpan('ActivityPushTokensService.registerActivityToken'))
