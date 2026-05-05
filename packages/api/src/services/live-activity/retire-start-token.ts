import type { SqlError } from '@effect/sql/SqlError'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { Effect } from 'effect'

// APNs returned a terminal token error (BadDeviceToken / Unregistered) for a
// push-to-start. Flip the device token inactive and end the orphan start row.
// Both writes together stop the row from being silently re-activated by
// `upsertStartToken` on the next app launch — that path's invariant is
// "only re-activate if the device_token is still active."
export const retireStartTokenForDevice = (
  deviceTokenId: string
): Effect.Effect<
  void,
  SqlError,
  ActivityPushTokenRepository | DeviceTokenRepository
> =>
  Effect.gen(function* () {
    const deviceTokenRepo = yield* DeviceTokenRepository
    const activityRepo = yield* ActivityPushTokenRepository
    yield* deviceTokenRepo.update(deviceTokenId, { isActive: false })
    yield* activityRepo.endStartTokenByDeviceTokenId(deviceTokenId)
  })
