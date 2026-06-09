import type { SqlError } from '@effect/sql/SqlError'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { Effect } from 'effect'

// APNs returned a terminal token error (BadDeviceToken / Unregistered) for a
// push-to-start. End the orphan start-token row so the next care send takes
// the start path and the device can re-register a fresh token.
//
// We deliberately do NOT touch `device_tokens.is_active` here. That row drives
// REGULAR Expo pushes, which are independent of the APNs Live Activity token —
// a Live Activity `BadDeviceToken` says nothing about the Expo token's
// validity. Deactivating it used to silently suppress a user's regular
// notifications until the app happened to re-register. The Expo token's
// lifecycle is owned by registration (`upsertByToken`) and explicit
// unregister/logout (which deletes the row) — never by an LA-token failure.
export const retireStartTokenForDevice = (
  deviceTokenId: string
): Effect.Effect<void, SqlError, ActivityPushTokenRepository> =>
  Effect.gen(function* () {
    const activityRepo = yield* ActivityPushTokenRepository
    yield* activityRepo.endStartTokenByDeviceTokenId(deviceTokenId)
  })
