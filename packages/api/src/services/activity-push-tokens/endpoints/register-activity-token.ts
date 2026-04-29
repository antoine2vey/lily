import type { SqlError } from '@effect/sql/SqlError'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type {
  ActivityPushToken,
  RegisterActivityTokenRequest,
} from '@lily/shared'
import { DateTime, Duration, Effect } from 'effect'

// 10h soft ceiling — safely inside Apple's 12h hard cap. The safety
// scheduler sweeps expired activities on this boundary.
const ACTIVITY_TTL = Duration.hours(10)

export const registerActivityToken = (
  request: RegisterActivityTokenRequest
): Effect.Effect<
  ActivityPushToken,
  SqlError,
  ActivityPushTokenRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* ActivityPushTokenRepository
    const { id: userId } = yield* CurrentUser

    const endsAt = DateTime.toDateUtc(
      DateTime.addDuration(DateTime.unsafeNow(), ACTIVITY_TTL)
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
