import type { SqlError } from '@effect/sql/SqlError'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type {
  DeviceToken,
  DeviceTokenCreateRequest,
} from '@lily/shared/device-token'
import { Effect } from 'effect'

/**
 * Register (or claim) a device's Expo push token for the current user.
 *
 * `device_tokens.token` is globally UNIQUE — one row per APNs/FCM
 * registration. The same physical device can change hands between accounts
 * (user signs out → another user signs in), so we use an atomic upsert keyed
 * on `token`:
 *   - no existing row             → INSERT
 *   - row already owned by user   → idempotent reactivation
 *   - row owned by another user   → reassign device to current user
 *
 * The reassignment path is logged at `warning` level for audit. We don't
 * refuse it because doing so would break the legitimate sign-in-on-shared-
 * device flow — and the abuse surface is narrow: an attacker would need a
 * valid JWT for their own account plus knowledge of the victim's opaque
 * push token, and even then the attack reduces to push-notification DoS
 * (notifications still land on the device that physically holds the APNs
 * certificate, never on the attacker's device).
 */
export const registerDeviceToken = (
  request: DeviceTokenCreateRequest
): Effect.Effect<DeviceToken, SqlError, DeviceTokenRepository | CurrentUser> =>
  Effect.gen(function* () {
    const repo = yield* DeviceTokenRepository
    const { id: currentUserId } = yield* CurrentUser

    // Pre-check is purely for audit logging; the upsert below is the
    // authoritative atomic operation.
    const existing = yield* repo.findByToken(request.token)
    if (existing && existing.userId !== currentUserId) {
      yield* Effect.logWarning('Device token reassigned across users', {
        deviceTokenId: existing.id,
        previousUserId: existing.userId,
        newUserId: currentUserId,
      })
    }

    const result = yield* repo.upsertByToken({
      token: request.token,
      platform: request.platform,
      userId: currentUserId,
    })

    if (!result) {
      // RETURNING * always yields the inserted/updated row; null here would
      // mean the DB violated its own atomicity guarantee.
      return yield* Effect.die('upsertByToken returned no row')
    }
    return result
  }).pipe(Effect.withSpan('DeviceTokensService.registerDeviceToken'))
